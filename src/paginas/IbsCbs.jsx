import { useEffect, useState, useSyncExternalStore } from "react";
import { CSTS, brl, calcular, conferir, csv, itemManual, lerReferencia, lerXml, mesclarReferencias, pct, xmlsDeExemplo } from "../lib/ibsCbs.mjs";
import { carregarXlsx } from "../lib/leitores.js";
import { useAvisos } from "../componentes/Avisos.jsx";
import { Campo, Selo } from "../componentes/contabil/ui.jsx";
import { compararComReceita, contextoNota, lerResultado, montarOperacao, textoVersao } from "../lib/receitaRtc.mjs";
import { RECEITA_NO_SERVIDOR, calcularNaReceita, versaoReceita } from "../lib/receitaServidor.js";

/*
 * Auditor IBS/CBS: confere os itens de NF-e e NFS-e no grupo IBSCBS (CST, cClassTrib, base, alíquotas e valores).
 * Regras em src/lib/ibsCbs.mjs (testadas em tests/ibsCbs.test.js). Os itens ficam só na memória desta aba.
 */
let itens = [], arquivos = [], versao = 0;
// calculadora da Receita: dados de cada nota (data, município), resultado por item ("doc#nItem") e versão das regras
let contextos = {}, receita = {}, versaoRec = null;
const chaveItem = (r) => r.doc + "#" + r.nItem;
// tabela de referência da equipe fiscal (NCM → CST, cClassTrib, redução): fica guardada neste navegador
const CHAVE_REF = "ibscbs:referencia:v1";
let referencia = (() => { try { return JSON.parse(localStorage.getItem(CHAVE_REF) || "null"); } catch (e) { return null; } })();
function guardarReferencia(r) { referencia = r; try { if (r) localStorage.setItem(CHAVE_REF, JSON.stringify(r)); else localStorage.removeItem(CHAVE_REF); } catch (e) { /* ignora */ } mudou(); }
const ouvintes = new Set();
const mudou = () => { versao++; ouvintes.forEach((f) => f()); };
const usarItens = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => versao);
function carregarTexto(nome, texto) {
  const r = lerXml(texto, nome);
  contextos[nome] = contextoNota(texto);
  arquivos = arquivos.concat([{ nome, ok: r.itens.length > 0, texto: r.itens.length ? r.itens.length + " item(ns) encontrados" : r.erro }]);
  itens = itens.concat(r.itens);
  mudou();
}
const NIVEL = { ok: ["ok", "OK"], atencao: ["pendente", "Atenção"], erro: ["erro", "Erro"] };
const NIVEL_RECEITA = { ok: ["ok", "Confere"], erro: ["erro", "Diverge"], sem: ["pendente", "Não calculado"] };

/** Versão das regras da Receita (busca uma vez por sessão). */
function usarVersaoReceita() {
  const [, set] = useState(0);
  useEffect(() => {
    if (!RECEITA_NO_SERVIDOR || versaoRec) return;
    versaoReceita().then((v) => { versaoRec = v; set((n) => n + 1); mudou(); }).catch((e) => { versaoRec = { erro: e.message }; set((n) => n + 1); });
  }, []);
  return versaoRec;
}

/** Manda cada nota para a calculadora da Receita e guarda o resultado de cada item. */
async function conferirComReceita() {
  const porDoc = new Map();
  itens.forEach((r) => { if (!porDoc.has(r.doc)) porDoc.set(r.doc, []); porDoc.get(r.doc).push(r); });
  let notas = 0, falhas = 0;
  for (const [doc, lista] of porDoc) {
    const ctx = contextos[doc];
    const sem = (msg) => lista.forEach((r) => { receita[chaveItem(r)] = { nivel: "sem", msgs: [msg] }; });
    if (!ctx) { sem("Item sem XML: a calculadora precisa da data e do município da nota."); continue; }
    const m = montarOperacao(lista, ctx, ctx.chave || doc);
    if (m.erro) { sem(m.erro); continue; }
    try {
      const calc = lerResultado(await calcularNaReceita(m.operacao));
      notas++;
      lista.forEach((r) => {
        const n = Number(r.nItem), fora = m.fora.find((f) => f.nItem === n);
        receita[chaveItem(r)] = fora ? { nivel: "sem", msgs: [fora.motivo] } : Object.assign(compararComReceita(r, calc[n]), { calc: calc[n] });
      });
    } catch (e) { falhas++; sem("A Receita não calculou esta nota: " + e.message); }
    mudou();
  }
  mudou();
  return { notas, falhas };
}

function Conferencia() {
  usarItens();
  const { aviso } = useAvisos();
  const [arrastando, setArrastando] = useState(false);
  const [manual, setManual] = useState(false);
  const [m, setM] = useState({});
  const [abertos, setAbertos] = useState({});
  const [filtro, setFiltro] = useState("");
  const [calculando, setCalculando] = useState(false);
  const vRec = usarVersaoReceita();
  async function importarReferencia(f) {
    try {
      const XLSX = await carregarXlsx();
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
      const r = lerReferencia(linhas);
      if (!r.total) { aviso("Nenhum NCM válido na planilha." + (r.avisos.length ? " " + r.avisos.join(" ") : "")); return; }
      guardarReferencia({ itens: r.itens, total: r.total, arquivo: f.name, em: new Date().toISOString() });
      aviso("Tabela de referência carregada: " + r.total + " NCM(s)." + (r.avisos.length ? " Avisos: " + r.avisos.join(" ") : ""));
    } catch (err) { aviso("Não consegui ler a tabela: " + (err.message || err)); }
  }
  // tabela pronta da LC 214 (anexos de mercadorias), carregada só quando pedida
  const tabelaLc214 = async () => { const m = await import("../lib/ibsLc214.json"); return m.default || m; };
  async function usarLc214(completar) {
    try {
      const t = await tabelaLc214();
      const r = lerReferencia([t.cabecalho].concat(t.linhas));
      if (completar && referencia) {
        const j = mesclarReferencias(r.itens, referencia.itens);
        guardarReferencia({ itens: j.itens, total: j.total, arquivo: referencia.arquivo.replace(/ \+ LC 214.*$/, "") + " + LC 214/2025", em: new Date().toISOString(), lc214: true });
        aviso("Tabela completada com a LC 214: " + j.daBase + " NCM(s) novos. Os da sua tabela continuam valendo.");
      } else {
        guardarReferencia({ itens: r.itens, total: r.total, arquivo: "LC 214/2025 (anexos, incluída no sistema)", em: new Date().toISOString(), lc214: true });
        aviso("Tabela da LC 214 em uso: " + r.total + " NCM(s).");
      }
    } catch (err) { aviso("Não consegui carregar a tabela da LC 214: " + (err.message || err)); }
  }
  async function baixarLc214() {
    try {
      const [XLSX, t] = await Promise.all([carregarXlsx(), tabelaLc214()]);
      const ws = XLSX.utils.aoa_to_sheet([t.cabecalho].concat(t.linhas));
      ws["!cols"] = [{ wch: 11 }, { wch: 60 }, { wch: 6 }, { wch: 11 }, { wch: 11 }, { wch: 90 }];
      const notas = XLSX.utils.aoa_to_sheet([["Fonte"], [t.fonte], [""], ["Como usar"],
        ["O auditor procura o NCM do item do mais específico para o mais geral (8, 6, 5, 4 e 2 dígitos)."],
        ["Linhas com ATENÇÃO: o mesmo NCM aparece em mais de um anexo; a redução depende da descrição do produto (ficou a menor)."],
        ["Medicamentos (30.03 e 30.04): redução de 60%; alíquota zero só para os da lista do art. 146 (ato conjunto a cada 120 dias)."],
        ["Serviços (Anexos II, III, X e XI) usam NBS, não NCM, e não estão nesta tabela."], ["Gerada em " + t.geradaEm + ". Confira com a equipe fiscal antes de usar como regra."]]);
      notas["!cols"] = [{ wch: 120 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Referência IBS-CBS");
      XLSX.utils.book_append_sheet(wb, notas, "Fonte e notas");
      XLSX.writeFile(wb, "Tabela_referencia_IBS_CBS_LC214.xlsx");
    } catch (err) { aviso("Não consegui gerar o Excel: " + (err.message || err)); }
  }
  async function baixarModelo() {
    try {
      const XLSX = await carregarXlsx();
      const ws = XLSX.utils.aoa_to_sheet([["NCM", "Descrição", "CST", "cClassTrib", "Redução (%)", "Observação"],
        ["10063021", "Arroz", "200", "200003", 60, "Exemplo: cesta básica"], ["84713012", "Notebook", "000", "000001", 0, "Exemplo: tributação integral"]]);
      ws["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 32 }];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Referência IBS-CBS");
      XLSX.writeFile(wb, "Tabela_referencia_IBS_CBS.xlsx");
    } catch (err) { aviso("Não consegui gerar o modelo: " + (err.message || err)); }
  }
  async function adicionar(lista) {
    const xs = Array.from(lista || []).filter((f) => f.name.toLowerCase().endsWith(".xml"));
    if (!xs.length) { aviso("Escolha arquivos .xml de NF-e ou NFS-e."); return; }
    for (const f of xs) carregarTexto(f.name, await f.text());
  }
  const incluir = (ev) => {
    ev.preventDefault();
    try { itens = itens.concat([itemManual(m, itens.length + 1)]); mudou(); setM({}); aviso("Item incluído."); } catch (err) { aviso(err.message); }
  };
  const baixar = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv(itens, ref)], { type: "text/csv;charset=utf-8;" }));
    a.download = "conferencia_ibs_cbs_" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const ref = referencia && referencia.itens;
  const conf = itens.map((r) => conferir(r, ref));
  const cont = { ok: 0, atencao: 0, erro: 0 }; conf.forEach((c) => cont[c.nivel]++);
  const notas = [...new Set(itens.map((r) => r.nfNumber).filter(Boolean))];
  const visiveis = itens.map((r, i) => [r, conf[i], i]).filter(([, c]) => !filtro || c.nivel === filtro);
  const campo = (k, rot, ph, larg) => (
    <Campo rotulo={rot} id={"m-" + k} className={larg || ""}><input id={"m-" + k} value={m[k] || ""} placeholder={ph} onChange={(e) => setM({ ...m, [k]: e.target.value })} /></Campo>
  );
  return (
    <div className="space-y-4">
      <div onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)} onDrop={(e) => { e.preventDefault(); setArrastando(false); adicionar(e.dataTransfer.files); }}>
        <label className={"block cursor-pointer rounded-xl border-2 border-dashed px-6 py-7 text-center transition-colors " + (arrastando ? "border-brand bg-brand-soft" : "border-line-strong bg-surface-2 hover:border-brand-fill")}>
          <input type="file" hidden multiple accept=".xml" onChange={(e) => { adicionar(e.target.files); e.target.value = ""; }} />
          <strong className="block text-[14.5px]">Arraste os XML de NF-e ou NFS-e aqui, ou clique para escolher</strong>
          <span className="text-[13px] text-muted">Os arquivos são lidos só neste navegador e não ficam guardados.</span>
        </label>
      </div>
      <section className="cartao p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <strong className="block text-[14px]">Tabela de referência por NCM</strong>
          <span className="text-[12.5px] text-muted">{referencia ? referencia.total + " NCM(s) de " + referencia.arquivo + ", carregada em " + new Date(referencia.em).toLocaleDateString("pt-BR") + ". Cada item é comparado com o CST, o cClassTrib e a redução esperados."
            : "Sem tabela: o auditor confere só a conta da nota. Use a tabela da LC 214 (pronta, com os anexos de mercadorias) ou carregue a planilha da equipe fiscal (NCM, CST, cClassTrib, redução)."}</span>
        </div>
        {!referencia && <button type="button" className="btn-primario btn-sm" onClick={() => usarLc214(false)}>Usar a tabela da LC 214</button>}
        {referencia && !referencia.lc214 && <button type="button" className="btn-contorno btn-sm" onClick={() => usarLc214(true)} title="A sua tabela continua valendo; a da LC 214 só completa os NCMs que faltam">Completar com a LC 214</button>}
        <label className="btn-contorno btn-sm cursor-pointer"><input type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => { if (e.target.files[0]) importarReferencia(e.target.files[0]); e.target.value = ""; }} />{referencia ? "Trocar tabela" : "Carregar tabela"}</label>
        <button type="button" className="btn-fantasma btn-sm" onClick={baixarLc214}>Baixar a da LC 214</button>
        <button type="button" className="btn-fantasma btn-sm" onClick={baixarModelo}>Baixar modelo</button>
        {referencia && <button type="button" className="btn-fantasma btn-sm text-debit" onClick={() => guardarReferencia(null)}>Tirar tabela</button>}
      </section>
      <section className="cartao p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <strong className="block text-[14px]">Calculadora oficial da Receita Federal</strong>
          <span className="text-[12.5px] text-muted">{!RECEITA_NO_SERVIDOR ? "Disponível só com o servidor ligado."
            : !vRec ? "Consultando a versão das regras..." : vRec.erro ? "Receita fora do ar agora: " + vRec.erro
            : textoVersao(vRec) + ". Recalcula cada item com as regras oficiais e compara com o que veio na nota (tolerância de R$ 0,01)."}</span>
        </div>
        <button type="button" className="btn-primario btn-sm" disabled={!RECEITA_NO_SERVIDOR || !itens.length || calculando}
          onClick={async () => { setCalculando(true); try { const r = await conferirComReceita(); aviso(r.notas + " nota(s) conferidas com a Receita" + (r.falhas ? ", " + r.falhas + " com falha" : "") + "."); } finally { setCalculando(false); } }}>
          {calculando ? "Conferindo..." : "Conferir com a Receita"}</button>
      </section>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-contorno btn-sm" onClick={() => setManual(!manual)}>{manual ? "Fechar inclusão manual" : "Incluir item à mão"}</button>
        {!itens.length && <button type="button" className="btn-fantasma btn-sm" onClick={() => xmlsDeExemplo().forEach(([n, t]) => carregarTexto(n, t))}>Usar exemplo</button>}
        <div className="flex-1" />
        {itens.length > 0 && <><button type="button" className="btn-primario btn-sm" onClick={baixar}>Exportar CSV (Excel)</button>
          <button type="button" className="btn-fantasma btn-sm" onClick={() => { itens = []; arquivos = []; contextos = {}; receita = {}; mudou(); }}>Limpar</button></>}
      </div>
      {manual && (
        <form onSubmit={incluir} className="cartao p-4 space-y-3">
          <h2 className="text-[15px] font-semibold">Item vendido (sem XML)</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {campo("desc", "Descrição", "", "sm:col-span-2")}{campo("cProd", "Código")}{campo("ncm", "NCM")}
            {campo("cfop", "CFOP")}{campo("qCom", "Quantidade")}{campo("vUnCom", "Valor unitário")}{campo("cst", "CST", "000")}
            {campo("cClassTrib", "cClassTrib", "000001")}{campo("bc", "Base de cálculo")}{campo("pIbsUf", "Alíquota IBS-UF (%)", "0,10")}{campo("pIbsMun", "Alíquota IBS-Mun (%)", "0,00")}
            {campo("vIbs", "Valor IBS informado", "calcula se vazio")}{campo("pCbs", "Alíquota CBS (%)", "0,90")}{campo("vCbs", "Valor CBS informado", "calcula se vazio")}
          </div>
          <div className="flex justify-end gap-2"><button type="button" className="btn-fantasma btn-sm" onClick={() => setM({})}>Limpar campos</button><button type="submit" className="btn-primario btn-sm">Incluir na conferência</button></div>
        </form>
      )}
      {arquivos.length > 0 && (
        <ul className="text-[12.5px] space-y-0.5">
          {arquivos.map((a, i) => <li key={i} className="flex gap-2"><span className="truncate">{a.nome}</span><span className={a.ok ? "text-credit" : "text-debit"}>· {a.texto}</span></li>)}
        </ul>
      )}
      {!itens.length ? <p className="cartao p-8 text-center text-muted text-[13.5px]">Nenhum item ainda. Traga os XML ou inclua um item à mão.</p> : (
        <section className="cartao overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3.5 pb-2">
            <span className="text-[13.5px] font-semibold mr-2">{itens.length} item(ns) de {new Set(itens.map((r) => r.doc)).size} documento(s){notas.length === 1 ? " · NF nº " + notas[0] : notas.length > 1 ? " · " + notas.length + " notas" : ""}</span>
            {[["", "Todos"], ["erro", "Erro · " + cont.erro], ["atencao", "Atenção · " + cont.atencao], ["ok", "OK · " + cont.ok]].map(([v, t]) => (
              <button key={v} type="button" aria-pressed={filtro === v} onClick={() => setFiltro(v)}
                className={"rounded-full border px-3 py-1 text-[13px] " + (filtro === v ? "bg-brand-soft border-brand text-brand font-semibold" : "border-line bg-surface")}>{t}</button>
            ))}
          </div>
          <div className="overflow-x-auto relative">
            <table className="w-full text-[12.5px]">
              <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-muted">
                <tr>{["#", "Descrição", "NCM", "CFOP", "Valor", "CST", "cClassTrib", "BC", "IBS UF / Mun (nominal)", "IBS efetiva", "IBS", "CBS (nominal)", "CBS efetiva", "CBS", "Situação", "Receita"].map((h, i) => (
                  <th key={h} className={"px-2 py-2 font-semibold " + (i === 1 ? "text-left min-w-[200px]" : i >= 4 && i !== 5 && i !== 6 && i < 14 ? "text-right" : "text-left")}>{h}</th>))}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visiveis.map(([r, c, i]) => [
                  <tr key={"l" + i} className="hover:bg-surface-2 cursor-pointer" onClick={() => setAbertos({ ...abertos, [i]: !abertos[i] })} aria-expanded={!!abertos[i]}>
                    <td className="px-2 py-1.5 text-muted">{i + 1} {abertos[i] ? "▴" : "▾"}</td>
                    <td className="px-2 py-1.5">{r.desc}{r.cProd && <span className="block text-[11px] text-muted">Cód. {r.cProd}</span>}</td>
                    <td className="px-2 py-1.5">{r.ncm || "—"}</td><td className="px-2 py-1.5">{r.cfop || "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{brl(r.vProd)}</td>
                    <Celula valor={r.cst || "—"} campo={c.campos.cst} />
                    <Celula valor={r.cClassTrib || "—"} campo={c.campos.cClassTrib} />
                    <td className="px-2 py-1.5 text-right tabular-nums">{brl(r.bc)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{pct(r.pIbsUf)} / {pct(r.pIbsMun)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{pct(r.pAliqEfetUf ?? r.pIbsUf)} / {pct(r.pAliqEfetMun ?? r.pIbsMun)}</td>
                    <Celula valor={brl(r.vIbs)} direita campo={erroDeValor(c.campos, ["IBS-UF", "IBS-Município"])} />
                    <td className="px-2 py-1.5 text-right tabular-nums">{pct(r.pCbs)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{pct(r.pAliqEfetCbs ?? r.pCbs)}</td>
                    <Celula valor={brl(r.vCbs)} direita campo={erroDeValor(c.campos, ["CBS"])} />
                    <td className="px-2 py-1.5"><Selo tipo={NIVEL[c.nivel][0]}>{NIVEL[c.nivel][1]}</Selo></td>
                    <td className="px-2 py-1.5">{receita[chaveItem(r)] ? <Selo tipo={NIVEL_RECEITA[receita[chaveItem(r)].nivel][0]}>{NIVEL_RECEITA[receita[chaveItem(r)].nivel][1]}</Selo> : <span className="text-muted">—</span>}</td>
                  </tr>,
                  abertos[i] && (
                    <tr key={"d" + i} className="bg-surface-2/60"><td />
                      <td colSpan={15} className="px-2 py-2">
                        <PorCampo campos={c.campos} />
                        <ul className="space-y-0.5 text-[12.5px]">
                          {c.msgs.map((x, k) => <li key={k} className={x.nivel === "erro" ? "text-debit" : x.nivel === "atencao" ? "text-warn" : "text-credit"}>{x.nivel === "erro" ? "✕ " : x.nivel === "atencao" ? "! " : "✓ "}{x.texto}</li>)}
                          {receita[chaveItem(r)] && <DaReceita res={receita[chaveItem(r)]} />}
                          <li className="text-muted">Documento de origem: <b className="text-ink">{r.doc}</b>{r.cClassTrib ? " · cClassTrib " + r.cClassTrib : ""}</li>
                        </ul>
                      </td></tr>
                  )
                ])}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-[12.5px] text-muted">Coluna Receita: resultado da calculadora oficial (botão "Conferir com a Receita"). Em vermelho, com o correto embaixo: o campo que não confere. Clique na linha para ver campo por campo. Tolerância de R$ 0,03 por valor. Com redução (gRed), a conta usa a alíquota efetiva. O Excel traz uma coluna de erro e o valor correto para CST, cClassTrib e alíquotas.</p>
        </section>
      )}
    </div>
  );
}

/** Célula da tabela: em vermelho, com o valor correto embaixo, quando o campo não confere. */
function Celula({ valor, campo, direita }) {
  const erro = campo && campo.erro;
  return (
    <td className={"px-2 py-1.5 " + (direita ? "text-right tabular-nums " : "") + (erro ? "text-debit font-semibold" : "")} title={erro || undefined}>
      {valor}
      {erro && <span className="block text-[11px] font-normal whitespace-nowrap">{campo.correto ? "correto: " + campo.correto : "confira"}</span>}
    </td>
  );
}
/** Erro de valor de um ou mais tributos, no formato da Celula (correto = soma dos valores corretos). */
function erroDeValor(campos, nomes) {
  const ts = nomes.map((n) => campos.aliquotas.tributos[n]).filter(Boolean);
  const comErro = ts.filter((t) => t.erro);
  if (!comErro.length) return null;
  const ok = ts.every((t) => t.valorCorreto !== null);
  return { erro: comErro.map((t) => t.erro).join("; "), correto: ok ? "R$ " + brl(ts.reduce((a, t) => a + t.valorCorreto, 0)) : "" };
}
/** Quadro campo por campo (CST, cClassTrib, cada tributo): o que veio, o correto e o erro. */
function PorCampo({ campos }) {
  const linhas = [["CST", campos.cst], ["cClassTrib", campos.cClassTrib]];
  const tributos = Object.entries(campos.aliquotas.tributos);
  return (
    <table className="mb-2 text-[12.5px] border border-line rounded-md bg-surface">
      <thead className="text-[11px] uppercase tracking-wide text-muted"><tr><th className="px-2 py-1 text-left font-semibold">Campo</th><th className="px-2 py-1 text-left font-semibold">Correto</th><th className="px-2 py-1 text-left font-semibold">Conferência</th></tr></thead>
      <tbody className="divide-y divide-line">
        {linhas.map(([n, c]) => (
          <tr key={n}><td className="px-2 py-1 font-medium">{n}</td><td className="px-2 py-1 tabular-nums">{c.correto || "—"}</td>
            <td className={"px-2 py-1 " + (c.erro ? "text-debit" : "text-credit")}>{c.erro || "confere"}</td></tr>
        ))}
        {tributos.map(([n, t]) => (
          <tr key={n}><td className="px-2 py-1 font-medium">{n}</td>
            <td className="px-2 py-1 tabular-nums whitespace-nowrap">{pct(t.efetivaCorreta)} · R$ {brl(t.valorCorreto)}</td>
            <td className={"px-2 py-1 " + (t.erro ? "text-debit" : "text-credit")}>{t.erro || "confere"}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Calculadora() {
  const [c, setC] = useState({ bc: "", pIbsUf: "", pIbsMun: "", pCbs: "", vIbs: "", vCbs: "" });
  const r = calcular(c);
  const campo = (k, rot) => <Campo rotulo={rot} id={"c-" + k}><input id={"c-" + k} value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} inputMode="decimal" className="text-right tabular-nums" /></Campo>;
  return (
    <section className="cartao p-5 space-y-4 max-w-[860px]">
      <div><h2 className="text-[16px] font-semibold">Calculadora avulsa</h2><p className="text-[12.5px] text-muted">Base × alíquota, para conferir um item isolado. Informe os valores da nota para comparar.</p></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {campo("bc", "Base de cálculo (R$)")}{campo("pIbsUf", "Alíquota IBS-UF (%)")}{campo("pIbsMun", "Alíquota IBS-Município (%)")}
        {campo("pCbs", "Alíquota CBS (%)")}{campo("vIbs", "Valor de IBS na nota (R$)")}{campo("vCbs", "Valor de CBS na nota (R$)")}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[["IBS-UF", r.ibsUf], ["IBS-Município", r.ibsMun], ["IBS total", r.ibs], ["CBS", r.cbs], ["IBS + CBS", r.total]].map(([n, v], i) => (
          <div key={n} className={"rounded-lg border px-3 py-2 " + (i === 4 ? "border-brand-fill bg-brand-soft" : "border-line bg-surface-2")}><div className="text-[12px] text-muted">{n}</div><div className="text-[16px] font-semibold tabular-nums">R$ {brl(v)}</div></div>
        ))}
      </div>
      {r.msgs.map((m, i) => <p key={i} className={"rounded-lg px-3 py-2 text-[13px] " + (m.nivel === "ok" ? "bg-ok-soft text-credit" : "bg-debit-soft text-debit")}>{m.nivel === "ok" ? "✓ " : "✕ "}{m.texto}</p>)}
    </section>
  );
}

/** Linhas do detalhe: o que a calculadora da Receita achou deste item. */
function DaReceita({ res }) {
  const c = res.calc;
  return (
    <>
      {res.nivel === "ok" && <li className="text-credit">✓ Confere com a calculadora da Receita.</li>}
      {res.msgs.map((t, k) => <li key={"r" + k} className={res.nivel === "erro" ? "text-debit" : "text-warn"}>{res.nivel === "erro" ? "✕ Receita · " : "! Receita · "}{t}</li>)}
      {c && !c.semGrupo && <li className="text-ink-2">Pela Receita: BC R$ {brl(c.vBC)} · IBS-UF {pct(c.redUf ? c.redUf.pAliqEfet : c.pIbsUf)} = R$ {brl(c.vIbsUf)} · IBS-Mun {pct(c.redMun ? c.redMun.pAliqEfet : c.pIbsMun)} = R$ {brl(c.vIbsMun)} · CBS {pct(c.redCbs ? c.redCbs.pAliqEfet : c.pCbs)} = R$ {brl(c.vCbs)}{c.simulado ? " (cálculo simulado)" : ""}</li>}
      {c && c.memoria && c.memoria.length > 0 && <li className="text-muted text-[11.5px]">Memória de cálculo: {c.memoria.join(" | ")}</li>}
    </>
  );
}

function CalculadoraReceita() {
  usarItens();
  const vRec = usarVersaoReceita();
  const hoje = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ data: hoje, municipio: "4218707", uf: "SC", ncm: "", cst: "000", cClassTrib: "000001", base: "", quantidade: "1" });
  const [res, setRes] = useState(null);
  const [erro, setErro] = useState("");
  const [calculando, setCalculando] = useState(false);
  const campo = (k, rot, ph, extra) => <Campo rotulo={rot} id={"cr-" + k}><input id={"cr-" + k} value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...(extra || {})} /></Campo>;
  async function calcular(ev) {
    ev.preventDefault(); setErro(""); setRes(null);
    const m = montarOperacao([{ nItem: 1, found: true, cst: f.cst, cClassTrib: f.cClassTrib, ncm: f.ncm, bc: f.base, qCom: f.quantidade || 1 }],
      { dhEmi: f.data, municipio: f.municipio, uf: f.uf.toUpperCase(), modelo: "55" }, "calculadora-avulsa");
    if (m.erro || !m.operacao) { setErro(m.erro || (m.fora[0] && m.fora[0].motivo) || "Confira os campos."); return; }
    setCalculando(true);
    try { setRes(lerResultado(await calcularNaReceita(m.operacao))[1] || null); } catch (e) { setErro(e.message); } finally { setCalculando(false); }
  }
  const efet = (red, p) => pct(red ? red.pAliqEfet : p);
  return (
    <section className="cartao p-5 space-y-4 max-w-[860px]">
      <div><h2 className="text-[16px] font-semibold">Calculadora da Receita</h2>
        <p className="text-[12.5px] text-muted">Calcula um item com a calculadora oficial da Receita Federal (serviço público, em piloto). {vRec && !vRec.erro ? textoVersao(vRec) + "." : ""}</p></div>
      {!RECEITA_NO_SERVIDOR ? <p className="text-[13px] text-warn">Disponível só com o servidor ligado.</p> : (
        <form onSubmit={calcular} className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {campo("data", "Data do fato gerador", "", { type: "date" })}{campo("municipio", "Município (código IBGE)", "4218707", { inputMode: "numeric" })}{campo("uf", "UF", "SC", { maxLength: 2 })}{campo("ncm", "NCM (opcional)")}
            {campo("cst", "CST", "000")}{campo("cClassTrib", "cClassTrib", "000001")}{campo("base", "Base de cálculo (R$)", "", { inputMode: "decimal", className: "text-right tabular-nums" })}{campo("quantidade", "Quantidade", "1", { inputMode: "decimal" })}
          </div>
          <div className="flex justify-end"><button type="submit" className="btn-primario btn-sm" disabled={calculando}>{calculando ? "Calculando..." : "Calcular na Receita"}</button></div>
        </form>
      )}
      {erro && <p className="rounded-lg px-3 py-2 text-[13px] bg-debit-soft text-debit">✕ {erro}</p>}
      {res && res.semGrupo && <p className="rounded-lg px-3 py-2 text-[13px] bg-surface-2">A Receita não calcula IBS/CBS para este CST/cClassTrib (CST {res.cst || "—"}).</p>}
      {res && !res.semGrupo && (<>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[["IBS-UF", res.vIbsUf, efet(res.redUf, res.pIbsUf)], ["IBS-Município", res.vIbsMun, efet(res.redMun, res.pIbsMun)], ["IBS total", res.vIbs, ""], ["CBS", res.vCbs, efet(res.redCbs, res.pCbs)],
            ["IBS + CBS", (res.vIbs || 0) + (res.vCbs || 0), ""]].map(([n, v, p], i) => (
            <div key={n} className={"rounded-lg border px-3 py-2 " + (i === 4 ? "border-brand-fill bg-brand-soft" : "border-line bg-surface-2")}><div className="text-[12px] text-muted">{n}{p ? " · " + p : ""}</div><div className="text-[16px] font-semibold tabular-nums">R$ {brl(v)}</div></div>
          ))}
        </div>
        <p className="text-[12.5px] text-ink-2">Base de cálculo pela Receita: R$ {brl(res.vBC)}{res.simulado ? " · cálculo simulado" : ""}</p>
        {res.memoria.length > 0 && <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12px] text-ink-2"><strong className="block text-[12px] text-muted mb-1">Memória de cálculo</strong>{res.memoria.map((t, i) => <div key={i}>{t}</div>)}</div>}
      </>)}
    </section>
  );
}

function Referencia() {
  return (
    <section className="cartao overflow-hidden">
      <div className="p-4 border-b border-line"><h2 className="text-[16px] font-semibold">CST do IBS/CBS</h2>
        <p className="text-[12.5px] text-muted">Tabela do Portal da Conformidade Fácil (SVRS). Cada CST se desdobra em vários cClassTrib (6 dígitos), que detalham o enquadramento na LC 214/2025: consulte o portal para a lista completa e atualizada.</p></div>
      <div className="overflow-x-auto relative">
        <table className="w-full text-[13px]">
          <thead className="bg-surface-2 text-[11.5px] uppercase tracking-wide text-muted"><tr><th className="px-4 py-2 text-left font-semibold">CST</th><th className="px-2 py-2 text-left font-semibold">Descrição</th><th className="px-2 py-2 text-left font-semibold">Indicador</th><th className="px-4 py-2 text-left font-semibold">Exemplos de cClassTrib</th></tr></thead>
          <tbody className="divide-y divide-line">{CSTS.map(([c, d, ind, ex]) => <tr key={c}><td className="px-4 py-2 font-semibold tabular-nums">{c}</td><td className="px-2 py-2">{d}</td><td className="px-2 py-2 text-ink-2">{ind}</td><td className="px-4 py-2 text-[12.5px] text-ink-2">{ex}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-[12.5px] text-muted">Ferramenta de apoio à conferência fiscal: não substitui a validação oficial da SEFAZ/Receita Federal nem a tabela vigente de CST/cClassTrib do Comitê Gestor do IBS.</p>
    </section>
  );
}

export default function IbsCbs() {
  const [aba, setAba] = useState("xml");
  return (
    <div className="space-y-4">
      <div className="inline-flex flex-wrap rounded-lg border border-line bg-surface p-0.5" role="tablist">
        {[["xml", "Conferência de XML"], ["receita", "Calculadora da Receita"], ["calc", "Calculadora"], ["ref", "Referência de CST"]].map(([id, nome]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
            className={"rounded-md px-3 py-1.5 text-[13px] " + (aba === id ? "bg-brand-soft text-brand font-semibold" : "text-ink-2")}>{nome}</button>
        ))}
      </div>
      {aba === "xml" ? <Conferencia /> : aba === "receita" ? <CalculadoraReceita /> : aba === "calc" ? <Calculadora /> : <Referencia />}
    </div>
  );
}
