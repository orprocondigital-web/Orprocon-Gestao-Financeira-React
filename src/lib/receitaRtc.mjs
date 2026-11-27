/*
 * Auditor IBS/CBS com a calculadora oficial da Receita Federal (Calculadora de Tributos, código aberto em
 * github.com/ReceitaFederal/calculadora-rtc-regime-regular). Aqui ficam só as regras, sem tela e sem rede:
 *   - ler da nota o que a calculadora precisa (data, município do fato gerador, UF, modelo);
 *   - montar a operação no formato da Receita (OperacaoInput), uma por nota;
 *   - ler a resposta (ROC) item a item;
 *   - comparar o destacado na nota com o calculado pela Receita.
 * A chamada à API fica em receitaServidor.js. Testado em tests/receitaRtc.test.js.
 */

export const TOLERANCIA_RECEITA = 0.01;

const UF_POR_CODIGO = {
  11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO", 21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB",
  26: "PE", 27: "AL", 28: "SE", 29: "BA", 31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR", 42: "SC", 43: "RS", 50: "MS",
  51: "MT", 52: "GO", 53: "DF"
};

const soDig = (v) => String(v == null ? "" : v).replace(/\D/g, "");
const tag = (xml, nome) => {
  const m = new RegExp("<(?:[\\w-]+:)?" + nome + "\\b[^>]*>([^<]*)<", "i").exec(xml || "");
  return m ? m[1].trim() : "";
};
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
};
const arred = (n) => Math.round(n * 100) / 100;

/** O que a calculadora precisa saber da nota (NF-e/NFC-e). Campos vazios = não encontrado. */
export function contextoNota(textoXml) {
  const xml = String(textoXml || "");
  const chaveAttr = /Id\s*=\s*"(?:NFe|CTe)?(\d{44})"/i.exec(xml);
  const cUF = soDig(tag(xml, "cUF"));
  return {
    chave: tag(xml, "chNFe") || (chaveAttr ? chaveAttr[1] : ""),
    dhEmi: tag(xml, "dhEmi") || tag(xml, "dEmi"),
    modelo: soDig(tag(xml, "mod")),
    municipio: soDig(tag(xml, "cMunFG")),
    uf: UF_POR_CODIGO[Number(cUF)] || ""
  };
}

/** Data/hora no formato da Receita (com fuso). Só a data → meio-dia de Brasília. */
export function dataHoraReceita(v) {
  const s = String(v || "").trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/.test(s)) return s.length === 16 + 6 ? s.slice(0, 16) + ":00" + s.slice(16) : s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + "T12:00:00-03:00";
  return "";
}

/**
 * Operação da Receita para UMA nota. itens = linhas do lerXml (ibsCbs.mjs) dessa nota.
 * Devolve { operacao, enviados: [nItem], fora: [{ nItem, motivo }], erro } (erro = a nota inteira não dá para mandar).
 */
export function montarOperacao(itens, ctx, idOperacao) {
  const fora = [];
  const dh = dataHoraReceita(ctx && ctx.dhEmi);
  const municipio = Number(soDig(ctx && ctx.municipio));
  if (!dh) return { operacao: null, enviados: [], fora: [], erro: "Data de emissão da nota não encontrada." };
  if (dh.slice(0, 4) >= "2027") return { operacao: null, enviados: [], fora: [], erro: "A partir de 2027 a calculadora exige as alíquotas nominais: ainda não conferido aqui." };
  if (!municipio) return { operacao: null, enviados: [], fora: [], erro: "Município do fato gerador (cMunFG) não encontrado na nota." };
  const lista = [];
  for (const r of itens || []) {
    const nItem = Number(r.nItem);
    if (!r.found) { fora.push({ nItem, motivo: "Item sem grupo IBS/CBS: não há o que conferir." }); continue; }
    if (!r.cst || !r.cClassTrib) { fora.push({ nItem, motivo: "Sem CST ou cClassTrib: a calculadora precisa dos dois." }); continue; }
    const base = num(r.bc) ?? num(r.vProd);
    if (base === null) { fora.push({ nItem, motivo: "Sem base de cálculo nem valor do produto." }); continue; }
    const item = { numero: nItem, cst: soDig(r.cst).padStart(3, "0"), cClassTrib: soDig(r.cClassTrib).padStart(6, "0"), baseCalculo: arred(base) };
    if (soDig(r.ncm)) item.ncm = soDig(r.ncm);
    const q = num(r.qCom);
    item.quantidade = q === null ? 1 : q;
    item.unidade = "UN";
    lista.push(item);
  }
  if (!lista.length) return { operacao: null, enviados: [], fora, erro: fora.length ? "Nenhum item da nota pode ser calculado." : "Nota sem itens." };
  const operacao = { id: String(idOperacao || (ctx && ctx.chave) || "nota").slice(0, 60), versao: "0.0.1", dhFatoGerador: dh, municipio, itens: lista };
  if (ctx && ctx.uf) operacao.uf = ctx.uf;
  if (ctx && /^(55|65)$/.test(ctx.modelo)) operacao.tpDoc = Number(ctx.modelo);
  return { operacao, enviados: lista.map((i) => i.numero), fora, erro: null };
}

/** Lê um campo sem se importar com maiúsculas (a resposta usa IBSCBS, gIBSCBS, vCBS...). */
function pega(obj, nome) {
  if (!obj || typeof obj !== "object") return undefined;
  if (nome in obj) return obj[nome];
  const k = Object.keys(obj).find((x) => x.toLowerCase() === nome.toLowerCase());
  return k === undefined ? undefined : obj[k];
}
const reducao = (g) => { const r = pega(g, "gRed"); return r ? { pRedAliq: num(pega(r, "pRedAliq")), pAliqEfet: num(pega(r, "pAliqEfet")) } : null; };

/** Resposta da Receita (ROC) → { [nItem]: { cst, cClassTrib, vBC, pIbsUf, vIbsUf, pIbsMun, vIbsMun, vIbs, pCbs, vCbs, memoria } }. */
export function lerResultado(roc) {
  const saida = {};
  for (const obj of pega(roc, "objetos") || []) {
    const nObj = Number(pega(obj, "nObj"));
    const ibscbs = pega(pega(obj, "tribCalc"), "IBSCBS");
    const g = pega(ibscbs, "gIBSCBS");
    if (!g) { saida[nObj] = { cst: pega(ibscbs, "CST") || null, cClassTrib: pega(ibscbs, "cClassTrib") || null, semGrupo: true, simulado: !!pega(obj, "calculoSimulado") }; continue; }
    const uf = pega(g, "gIBSUF"), mun = pega(g, "gIBSMun"), cbs = pega(g, "gCBS");
    saida[nObj] = {
      cst: pega(ibscbs, "CST") || null, cClassTrib: pega(ibscbs, "cClassTrib") || null,
      vBC: num(pega(g, "vBC")),
      pIbsUf: num(pega(uf, "pIBSUF")), vIbsUf: num(pega(uf, "vIBSUF")), redUf: reducao(uf),
      pIbsMun: num(pega(mun, "pIBSMun")), vIbsMun: num(pega(mun, "vIBSMun")), redMun: reducao(mun),
      vIbs: num(pega(g, "vIBS")),
      pCbs: num(pega(cbs, "pCBS")), vCbs: num(pega(cbs, "vCBS")), redCbs: reducao(cbs),
      memoria: [pega(cbs, "memoriaCalculo"), pega(uf, "memoriaCalculo"), pega(mun, "memoriaCalculo")].filter(Boolean),
      simulado: !!pega(obj, "calculoSimulado")
    };
  }
  return saida;
}

/** Destacado na nota × calculado pela Receita. { nivel: "ok" | "erro", msgs: [texto] }. */
export function compararComReceita(row, calc) {
  if (!calc) return { nivel: "sem", msgs: ["A Receita não devolveu cálculo para este item."] };
  const msgs = [];
  const moeda = (n) => (n === null || n === undefined ? "—" : "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const confere = (rotulo, nota, receita) => {
    if (receita === null || receita === undefined) return;
    const v = nota === null || nota === undefined ? 0 : nota;
    if (Math.abs(v - receita) > TOLERANCIA_RECEITA) msgs.push(rotulo + ": na nota " + moeda(nota) + ", pela Receita " + moeda(receita) + ".");
  };
  if (calc.semGrupo) return { nivel: "ok", msgs: [] };
  confere("CBS", num(row.vCbs), calc.vCbs);
  confere("IBS-UF", num(row.vIbsUf), calc.vIbsUf);
  confere("IBS-Município", num(row.vIbsMun), calc.vIbsMun);
  if (calc.vBC !== null && num(row.bc) !== null && Math.abs(num(row.bc) - calc.vBC) > TOLERANCIA_RECEITA)
    msgs.push("Base de cálculo: na nota " + moeda(num(row.bc)) + ", pela Receita " + moeda(calc.vBC) + ".");
  return { nivel: msgs.length ? "erro" : "ok", msgs };
}

/** Mensagem legível de um erro da Receita (corpo JSON ou texto). */
export function mensagemErro(corpo) {
  if (!corpo) return "A Receita recusou a operação.";
  let d = corpo;
  if (typeof corpo === "string") { try { d = JSON.parse(corpo); } catch (e) { return corpo.slice(0, 300); } }
  const partes = [];
  const junta = (o) => {
    if (!o || typeof o !== "object") return;
    for (const k of ["userMessage", "mensagem", "message", "detail", "titulo", "title"]) { const v = pega(o, k); if (typeof v === "string" && v && !partes.includes(v)) partes.push(v); }
  };
  junta(d);
  for (const k of ["objects", "objetos", "erros", "errors", "violacoes"]) { const l = pega(d, k); if (Array.isArray(l)) l.forEach(junta); }
  return partes.length ? partes.join(" · ").slice(0, 500) : "A Receita recusou a operação.";
}

/** "Regras da Receita: V0074 de 26/11/2026 (calculadora 1.7.3)". */
export function textoVersao(v) {
  if (!v) return "";
  const db = pega(v, "versaoDb"), data = pega(v, "dataVersaoDb"), app = String(pega(v, "versaoApp") || "").replace(/-.*$/, "");
  const dataBr = /^\d{4}-\d{2}-\d{2}/.test(data || "") ? data.slice(8, 10) + "/" + data.slice(5, 7) + "/" + data.slice(0, 4) : "";
  return "Regras da Receita: " + (db || "?") + (dataBr ? " de " + dataBr : "") + (app ? " (calculadora " + app + ")" : "");
}
