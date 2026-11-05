import { useState } from "react";
import { TIPOS_ALVARAS, TIPOS_CERTIDOES, abaDoTipo, chaveNome, lerCertidao } from "../../lib/depCadastro.mjs";
import { useDepCadastro } from "../../lib/useDepCadastro.js";
import { textoDoPdf } from "../../lib/leitores.js";
import { guardarArquivo } from "../../lib/arquivos.js";
import { useAvisos } from "../Avisos.jsx";
import Janela from "../Janela.jsx";
import { BotaoArquivo, Mensagem, Selo, dataBR } from "../contabil/ui.jsx";

/*
 * Ler PDFs de certidões e alvarás em lote: lê tipo, CNPJ (e com ele a empresa), emissão, vencimento e número;
 * a pessoa confere e salva. Cada PDF vai para a aba certa (Alvarás, Certidões ou Certificados) com o arquivo anexado.
 * Se a empresa já tem esse documento: vence depois = renova (o anterior vai para o histórico); mesmo vencimento =
 * só anexa o PDF; vence antes = não grava (não volta a data).
 * Usado nas abas Certidões e Alvarás (janela, com arrastar) e em Importar e demonstração.
 */
const NOME_ABA = { alvaras: "Alvarás", certificados: "Certificados digitais", certidoes: "Certidões" };
const ACAO = {
  novo: ["novo", "Cadastra"],
  renovacao: ["ok", "Renova"],
  igual: ["neutro", "Anexa o PDF"],
  antigo: ["pendente", "Não grava"]
};

function usePdfs() {
  const [svc] = useDepCadastro();
  const { aviso } = useAvisos();
  const [linhas, setLinhas] = useState([]);
  const [status, setStatus] = useState("");
  const [lendo, setLendo] = useState(false);
  const ler = async (files) => {
    const pdfs = files.filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (!pdfs.length) { setStatus("Escolha arquivos PDF."); return; }
    setLendo(true); setStatus("Lendo " + pdfs.length + " PDF(s)…");
    const lidos = [];
    for (const f of pdfs) {
      const vazio = { arquivo: f, tipo: "", clienteId: "", vencimento: "", emissao: "", numero: "", documento: "", nome: "" };
      try {
        const texto = await textoDoPdf(f);
        if (!texto.trim()) { lidos.push(Object.assign(vazio, { erro: "PDF digitalizado (imagem): preencha à mão.", marcado: true })); continue; }
        const r = lerCertidao(texto);
        const emp = svc.empresaPorDocumento(r.documento) || (r.nome && svc.empresas().find((c) => chaveNome(c.nome) === chaveNome(r.nome))) || null;
        lidos.push(Object.assign(vazio, r, { clienteId: emp ? emp.id : "", marcado: true }));
      } catch (e) { lidos.push(Object.assign(vazio, { erro: "Não consegui ler: " + (e.message || e), marcado: false })); }
    }
    setLinhas((l) => l.concat(lidos)); setStatus(""); setLendo(false);
  };
  const muda = (i, campo, v) => setLinhas((l) => l.map((x, k) => (k === i ? Object.assign({}, x, { [campo]: v }) : x)));
  const escolherEmpresa = (i, v) => {
    if (v !== "nova") { muda(i, "clienteId", v); return; }
    const l = linhas[i];   // cadastra com o nome e o CNPJ lidos do PDF; as outras linhas com o mesmo CNPJ já ficam com ela
    try {
      const c = svc.salvarEmpresa({ nome: l.nome, documento: l.documento });
      const dig = (x) => String(x || "").replace(/\D/g, "");
      setLinhas((ls) => ls.map((x) => (x === l || (dig(x.documento) && dig(x.documento) === dig(l.documento) && !x.clienteId) ? Object.assign({}, x, { clienteId: c.id }) : x)));
      aviso("Empresa cadastrada: " + c.nome);
    } catch (e) { aviso(e.message); }
  };
  const destino = (l) => svc.destinoDoPdf(l);
  const gravaveis = linhas.filter((l) => l.marcado && destino(l).acao !== "antigo");
  /** Grava o que está marcado. Devolve true quando não sobrou nada para corrigir. */
  const salvar = async () => {
    const conta = { novo: 0, renovacao: 0, igual: 0 }, abas = new Set(), erros = [];
    for (const l of gravaveis) {
      try {
        const r = svc.gravarPdf(l);
        if (!r.doc) continue;
        await guardarArquivo(r.doc.id, l.arquivo);
        svc.marcarAnexo(r.doc.id, { nome: l.arquivo.name, tamanho: l.arquivo.size });
        conta[r.acao] = (conta[r.acao] || 0) + 1; abas.add(NOME_ABA[abaDoTipo(r.doc.tipo)]);
      } catch (e) { erros.push(l.arquivo.name + ": " + e.message); }
    }
    const feitos = [conta.novo && conta.novo + " cadastrado(s)", conta.renovacao && conta.renovacao + " renovado(s)", conta.igual && conta.igual + " com o PDF anexado"].filter(Boolean);
    if (feitos.length) aviso(feitos.join(", ") + (abas.size ? ". Estão em " + [...abas].join(" e ") + "." : "."));
    setLinhas((ls) => ls.filter((l) => erros.some((e) => e.indexOf(l.arquivo.name + ":") === 0)));
    setStatus(erros.length ? "Faltou corrigir: " + erros.join(" · ") : "");
    return !erros.length;
  };
  return { svc, linhas, setLinhas, status, lendo, ler, muda, escolherEmpresa, destino, gravaveis, salvar };
}

/** Tabela de conferência (igual na janela e em Importar). */
function Previa({ p, grupo }) {
  const empresas = p.svc.empresas();
  const tipos = grupo === "alvaras" ? TIPOS_ALVARAS.concat(TIPOS_CERTIDOES) : TIPOS_CERTIDOES.concat(TIPOS_ALVARAS);
  return (
    <div className="overflow-x-auto relative border border-line rounded-lg">
      <table className="w-full text-[13px]">
        <thead className="bg-surface-2 text-left text-[12px] uppercase tracking-wide text-muted">
          <tr><th className="px-2 py-2" /><th className="px-2 py-2 font-semibold">Arquivo</th><th className="px-2 py-2 font-semibold">Empresa</th><th className="px-2 py-2 font-semibold">Tipo</th>
            <th className="px-2 py-2 font-semibold">Emissão</th><th className="px-2 py-2 font-semibold">Vencimento</th><th className="px-2 py-2 font-semibold">Número</th><th className="px-2 py-2 font-semibold">O que acontece</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {p.linhas.map((l, i) => {
            const d = p.destino(l), acao = ACAO[d.acao];
            return (
              <tr key={i} className="align-top">
                <td className="px-2 py-2"><input type="checkbox" checked={l.marcado} onChange={(e) => p.muda(i, "marcado", e.target.checked)} aria-label={"Gravar " + l.arquivo.name} /></td>
                <td className="px-2 py-2 max-w-[180px] break-all">{l.arquivo.name}{l.erro && <span className="block text-[12px] text-warn">{l.erro}</span>}{l.documento && <span className="block text-[12px] text-muted">{l.documento}</span>}</td>
                <td className="px-2 py-1.5 min-w-[190px]">
                  <select value={l.clienteId} onChange={(e) => p.escolherEmpresa(i, e.target.value)} aria-label={"Empresa de " + l.arquivo.name} className={"h-9 text-[13px] " + (l.clienteId ? "" : "border-warn")}>
                    <option value="">{l.documento ? "CNPJ não cadastrado: escolha…" : "Escolha…"}</option>
                    {!l.clienteId && l.nome && <option value="nova">+ Cadastrar {l.nome}</option>}
                    {empresas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5 min-w-[170px]"><input list={"pdf-tipos-" + (grupo || "todos")} value={l.tipo} onChange={(e) => p.muda(i, "tipo", e.target.value)} aria-label={"Tipo de " + l.arquivo.name} className={"h-9 text-[13px] " + (l.tipo ? "" : "border-warn")} />
                  {l.tipo && <span className="block text-[11.5px] text-muted mt-0.5">vai para {NOME_ABA[abaDoTipo(l.tipo)]}</span>}</td>
                <td className="px-2 py-1.5"><input type="date" value={l.emissao} onChange={(e) => p.muda(i, "emissao", e.target.value)} aria-label={"Emissão de " + l.arquivo.name} className="h-9 text-[13px] w-[150px]" /></td>
                <td className="px-2 py-1.5"><input type="date" value={l.vencimento} onChange={(e) => p.muda(i, "vencimento", e.target.value)} aria-label={"Vencimento de " + l.arquivo.name} className={"h-9 text-[13px] w-[150px] " + (l.vencimento ? "" : "border-warn")} /></td>
                <td className="px-2 py-1.5"><input value={l.numero} onChange={(e) => p.muda(i, "numero", e.target.value)} aria-label={"Número de " + l.arquivo.name} className="h-9 text-[13px] w-[140px]" /></td>
                <td className="px-2 py-2 min-w-[150px]">{acao ? <><Selo tipo={acao[0]}>{acao[1]}</Selo>
                  {d.atual && d.acao !== "novo" && <span className="block text-[11.5px] text-muted mt-0.5">{d.acao === "antigo" ? "já tem um que vence em " : "cadastrado: vence em "}{dataBR(d.atual.vencimento) || "sem data"}</span>}</>
                  : <span className="text-[12px] text-muted">falta empresa ou tipo</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <datalist id={"pdf-tipos-" + (grupo || "todos")}>{tipos.map((t) => <option key={t} value={t} />)}</datalist>
    </div>
  );
}

function ZonaArrastar({ p }) {
  const [arrastando, setArrastando] = useState(false);
  return (
    <div onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
      onDrop={(e) => { e.preventDefault(); setArrastando(false); p.ler(Array.from(e.dataTransfer.files || [])); }}
      className={"rounded-lg border-2 border-dashed px-4 py-5 text-center space-y-2 transition-colors " + (arrastando ? "border-brand-fill bg-surface-2" : "border-line")}>
      <p className="text-[13.5px]">Arraste aqui os <strong>PDFs</strong> de alvarás e certidões, um ou vários, ou</p>
      <BotaoArquivo aceita=".pdf" multiplo aoEscolher={p.ler} className="btn-contorno btn-sm" disabled={p.lendo}>{p.lendo ? "Lendo…" : "Escolher PDFs"}</BotaoArquivo>
      <p className="text-[12.5px] text-muted">O sistema lê a empresa (pelo CNPJ), o tipo, a emissão, o vencimento e o número. Você confere e salva; o PDF fica anexado.</p>
    </div>
  );
}

/** Janela "Ler PDFs" das abas Certidões e Alvarás. */
export function JanelaLerPdfs({ grupo, aoFechar }) {
  const p = usePdfs();
  const n = p.gravaveis.length;
  const salvar = async () => { if (await p.salvar()) aoFechar(); };
  return (
    <Janela aberta titulo={"Ler PDFs de " + (grupo === "alvaras" ? "alvarás" : "certidões")} aoFechar={aoFechar} largura="max-w-[1100px]"
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
        <button type="button" className="btn-primario" onClick={salvar} disabled={!n}>{n ? "Salvar " + n + " documento(s)" : "Salvar"}</button></>}>
      <div className="space-y-3">
        <ZonaArrastar p={p} />
        {p.status && <Mensagem texto={p.status} tipo={/Faltou|Escolha/.test(p.status) ? "aviso" : "info"} />}
        {p.linhas.length > 0 && <>
          <Previa p={p} grupo={grupo} />
          <p className="text-[12.5px] text-muted">Campos em laranja precisam ser preenchidos. Empresa nova: escolha "+ Cadastrar" na lista (usa o nome e o CNPJ do PDF).</p>
        </>}
      </div>
    </Janela>
  );
}

/** A mesma leitura, como seção da tela Importar e demonstração. */
export function SecaoPdfs() {
  const p = usePdfs();
  const n = p.gravaveis.length;
  return (
    <section className="cartao p-4 sm:p-5 space-y-3">
      <div>
        <h2 className="text-[16px] font-semibold">Certidões e alvarás em PDF</h2>
        <p className="text-[13px] text-muted">O mesmo "Ler PDFs" das abas Certidões e Alvarás.</p>
      </div>
      <ZonaArrastar p={p} />
      {p.status && <Mensagem texto={p.status} tipo={/Faltou|Escolha/.test(p.status) ? "aviso" : "info"} />}
      {p.linhas.length > 0 && (<>
        <Previa p={p} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted flex-1">Campos em laranja precisam ser preenchidos.</span>
          <button type="button" className="btn-fantasma btn-sm" onClick={() => p.setLinhas([])}>Descartar</button>
          <button type="button" className="btn-primario btn-sm" disabled={!n} onClick={p.salvar}>Salvar {n} documento(s)</button>
        </div>
      </>)}
    </section>
  );
}
