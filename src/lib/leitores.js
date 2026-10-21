/*
 * Leitura de arquivos no navegador: planilhas (.xlsx/.xlsm/.xls), extratos (PDF, OFX, TXT, CSV) e
 * download dos arquivos gerados. Os leitores de planilha e de PDF são grandes (~900 KB e ~1 MB), então
 * só são baixados na primeira vez que alguém importa algo, como na versão HTML.
 */
import { Core, Extratos, PdfExtrato } from "./legado.js";

const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const carregando = {};
function script(url, global, nome) {
  if (window[global]) return Promise.resolve(window[global]);
  if (carregando[url]) return carregando[url];
  carregando[url] = new Promise((ok, erro) => {
    const sc = document.createElement("script");
    sc.src = url;
    sc.onload = () => ok(window[global]);
    sc.onerror = () => { delete carregando[url]; sc.remove(); erro(new Error("o " + nome + " não carregou (verifique a internet)")); };
    document.head.appendChild(sc);
  });
  return carregando[url];
}
export function carregarXlsx() { return script(XLSX_URL, "XLSX", "leitor de planilhas"); }
function carregarPdfJs() {
  return script(PDFJS_URL, "pdfjsLib", "leitor de PDF").then((p) => { p.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return p; });
}

export function lerBuffer(file) {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = (ev) => ok(ev.target.result);
    r.onerror = () => erro(new Error("falha ao ler o arquivo"));
    r.readAsArrayBuffer(file);
  });
}
export function lerTexto(file) {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = (ev) => ok(ev.target.result);
    r.onerror = () => erro(new Error("falha ao ler o arquivo"));
    r.readAsText(file);
  });
}

/** Planilha → [{ nome, rows }] (todas as abas, na ordem da pasta de trabalho). */
export async function lerPlanilha(file) {
  const [XLSX, buf] = await Promise.all([carregarXlsx(), lerBuffer(file)]);
  await new Promise((r) => setTimeout(r, 30));   // deixa a mensagem "Lendo…" aparecer antes do trabalho pesado
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
  return wb.SheetNames.map((n) => ({ nome: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" }) }));
}

async function itensDoPdf(buffer) {
  const pdfjs = await carregarPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const paginas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const tc = await (await doc.getPage(n)).getTextContent();
    paginas.push(tc.items.filter((i) => i.str && i.str.trim()).map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width })));
  }
  return paginas;
}

/** Arquivo de extrato → { arquivo, formato, numeroConta, itens, conferencia } ou { arquivo, erro }. */
export async function lerArquivoExtrato(file) {
  const nome = file.name, ext = (nome.split(".").pop() || "").toLowerCase();
  try {
    const buf = await lerBuffer(file);
    if (ext === "pdf") {
      const r = PdfExtrato.lerExtratoPdf(await itensDoPdf(buf));
      if (r.semTexto) return { arquivo: nome, erro: "Este PDF é uma imagem (digitalizado ou foto): não tem texto para ler. Peça ao banco o extrato em OFX, ou um PDF gerado direto pelo internet banking." };
      return { arquivo: nome, formato: "PDF " + r.banco.nome, numeroConta: r.numeroConta, itens: r.itens, conferencia: r.conferencia };
    }
    if (ext === "xlsx" || ext === "xls") {
      const XLSX = await carregarXlsx();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
      const r = Core.parseExtratoRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" }));
      if (!r.ok) return { arquivo: nome, erro: r.erro };
      const conf = r.itens.some((i) => i.saldoLinha !== undefined)
        ? PdfExtrato.conferirSaldos(r.itens, r.saldoInicial !== undefined ? [{ tipo: "inicio", saldo: r.saldoInicial }] : [])
        : null;
      return { arquivo: nome, formato: "Planilha", numeroConta: r.numeroConta || "", itens: r.itens, conferencia: conf };
    }
    const e = Extratos.lerExtrato(Core.decodeText(new Uint8Array(buf)));
    if (e.ok === false) return { arquivo: nome, erro: e.erro || "Formato não reconhecido." };
    return { arquivo: nome, formato: e.formato === "genérico" ? "CSV/TXT" : e.formato, numeroConta: e.numeroConta || "", itens: e.itens || [] };
  } catch (err) {
    return { arquivo: nome, erro: "Não consegui ler: " + (err.message || err) };
  }
}

/** Baixa um ou mais arquivos de texto. [{ nome, conteudo, tipo? }] (UTF-8 sem BOM, como o Único espera). */
export function baixarArquivos(arquivos) {
  arquivos.forEach((a, i) => {
    setTimeout(() => {
      const blob = new Blob([a.conteudo], { type: a.tipo || "text/plain;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = a.nome;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    }, i * 300);   // vários de uma vez: o navegador bloqueia se forem juntos
  });
}

/** Texto de um PDF (linhas na ordem da página). Vazio quando o PDF é imagem (digitalizado). */
export async function textoDoPdf(file) {
  const paginas = await itensDoPdf(await lerBuffer(file));
  return paginas.map((itens) => {
    const linhas = [];
    itens.slice().sort((a, b) => b.y - a.y || a.x - b.x).forEach((i) => {
      const l = linhas.find((x) => Math.abs(x.y - i.y) < 3);
      if (l) l.partes.push(i); else linhas.push({ y: i.y, partes: [i] });
    });
    return linhas.map((l) => l.partes.sort((a, b) => a.x - b.x).map((p) => p.s).join(" ")).join("\n");
  }).join("\n");
}
