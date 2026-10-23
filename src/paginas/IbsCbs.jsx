import { useState, useSyncExternalStore } from "react";
import { CSTS, brl, calcular, conferir, csv, itemManual, lerXml, pct, xmlsDeExemplo } from "../lib/ibsCbs.mjs";
import { useAvisos } from "../componentes/Avisos.jsx";
import { Campo, Selo } from "../componentes/contabil/ui.jsx";

/*
 * Auditor IBS/CBS: confere os itens de NF-e e NFS-e no grupo IBSCBS (CST, cClassTrib, base, alíquotas e valores).
 * Regras em src/lib/ibsCbs.mjs (testadas em tests/ibsCbs.test.js). Os itens ficam só na memória desta aba.
 */
let itens = [], arquivos = [], versao = 0;
const ouvintes = new Set();
const mudou = () => { versao++; ouvintes.forEach((f) => f()); };
const usarItens = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => versao);
function carregarTexto(nome, texto) {
  const r = lerXml(texto, nome);
  arquivos = arquivos.concat([{ nome, ok: r.itens.length > 0, texto: r.itens.length ? r.itens.length + " item(ns) encontrados" : r.erro }]);
  itens = itens.concat(r.itens);
  mudou();
}
const NIVEL = { ok: ["ok", "OK"], atencao: ["pendente", "Atenção"], erro: ["erro", "Erro"] };

function Conferencia() {
  usarItens();
  const { aviso } = useAvisos();
  const [arrastando, setArrastando] = useState(false);
  const [manual, setManual] = useState(false);
  const [m, setM] = useState({});
  const [abertos, setAbertos] = useState({});
  const [filtro, setFiltro] = useState("");
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
    a.href = URL.createObjectURL(new Blob([csv(itens)], { type: "text/csv;charset=utf-8;" }));
    a.download = "conferencia_ibs_cbs_" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const conf = itens.map(conferir);
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
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-contorno btn-sm" onClick={() => setManual(!manual)}>{manual ? "Fechar inclusão manual" : "Incluir item à mão"}</button>
        {!itens.length && <button type="button" className="btn-fantasma btn-sm" onClick={() => xmlsDeExemplo().forEach(([n, t]) => carregarTexto(n, t))}>Usar exemplo</button>}
        <div className="flex-1" />
        {itens.length > 0 && <><button type="button" className="btn-primario btn-sm" onClick={baixar}>Exportar CSV (Excel)</button>
          <button type="button" className="btn-fantasma btn-sm" onClick={() => { itens = []; arquivos = []; mudou(); }}>Limpar</button></>}
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
                <tr>{["#", "Descrição", "NCM", "CFOP", "Valor", "CST", "cClassTrib", "BC", "IBS UF / Mun (nominal)", "IBS efetiva", "IBS", "CBS (nominal)", "CBS efetiva", "CBS", "Situação"].map((h, i) => (
                  <th key={h} className={"px-2 py-2 font-semibold " + (i === 1 ? "text-left min-w-[200px]" : i >= 4 && i !== 5 && i !== 6 && i !== 14 ? "text-right" : "text-left")}>{h}</th>))}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visiveis.map(([r, c, i]) => [
                  <tr key={"l" + i} className="hover:bg-surface-2 cursor-pointer" onClick={() => setAbertos({ ...abertos, [i]: !abertos[i] })} aria-expanded={!!abertos[i]}>
                    <td className="px-2 py-1.5 text-muted">{i + 1} {abertos[i] ? "▴" : "▾"}</td>
                    <td className="px-2 py-1.5">{r.desc}{r.cProd && <span className="block text-[11px] text-muted">Cód. {r.cProd}</span>}</td>
                    <td className="px-2 py-1.5">{r.ncm || "—"}</td><td className="px-2 py-1.5">{r.cfop || "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{brl(r.vProd)}</td>
                    <td className="px-2 py-1.5">{r.cst || "—"}</td><td className="px-2 py-1.5">{r.cClassTrib || "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{brl(r.bc)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{pct(r.pIbsUf)} / {pct(r.pIbsMun)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{pct(r.pAliqEfetUf ?? r.pIbsUf)} / {pct(r.pAliqEfetMun ?? r.pIbsMun)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{brl(r.vIbs)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{pct(r.pCbs)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{pct(r.pAliqEfetCbs ?? r.pCbs)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{brl(r.vCbs)}</td>
                    <td className="px-2 py-1.5"><Selo tipo={NIVEL[c.nivel][0]}>{NIVEL[c.nivel][1]}</Selo></td>
                  </tr>,
                  abertos[i] && (
                    <tr key={"d" + i} className="bg-surface-2/60"><td />
                      <td colSpan={14} className="px-2 py-2">
                        <ul className="space-y-0.5 text-[12.5px]">
                          {c.msgs.map((x, k) => <li key={k} className={x.nivel === "erro" ? "text-debit" : x.nivel === "atencao" ? "text-warn" : "text-credit"}>{x.nivel === "erro" ? "✕ " : x.nivel === "atencao" ? "! " : "✓ "}{x.texto}</li>)}
                          <li className="text-muted">Documento de origem: <b className="text-ink">{r.doc}</b>{r.cClassTrib ? " · cClassTrib " + r.cClassTrib : ""}</li>
                        </ul>
                      </td></tr>
                  )
                ])}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-[12.5px] text-muted">Clique na linha para ver o motivo. Tolerância de R$ 0,03 por valor. Com redução (gRed), a conta usa a alíquota efetiva.</p>
        </section>
      )}
    </div>
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
        {[["xml", "Conferência de XML"], ["calc", "Calculadora"], ["ref", "Referência de CST"]].map(([id, nome]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
            className={"rounded-md px-3 py-1.5 text-[13px] " + (aba === id ? "bg-brand-soft text-brand font-semibold" : "text-ink-2")}>{nome}</button>
        ))}
      </div>
      {aba === "xml" ? <Conferencia /> : aba === "calc" ? <Calculadora /> : <Referencia />}
    </div>
  );
}
