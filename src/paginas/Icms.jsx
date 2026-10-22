import { useEffect, useMemo, useRef, useState } from "react";
import { acumulado, apurar, lerValor, regraPadrao, xmlsDeExemplo } from "../lib/icms.mjs";
import { useIcms } from "../lib/useIcms.js";
import { carregarJsZip, carregarXlsx } from "../lib/leitores.js";
import { useAvisos } from "../componentes/Avisos.jsx";
import { Selo } from "../componentes/contabil/ui.jsx";

/*
 * Apuração parcial de ICMS: prévia do mês a partir das NF-e/NFC-e (a oficial continua no Único).
 * Regras em src/lib/icms.mjs (testadas em tests/icms.test.js); notas só na memória desta aba.
 */
const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtN = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const R$ = (v) => fmt.format(v || 0);
const dataBr = (iso) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "");
const docFmt = (d) => (d && d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d && d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d || "");

function Grafico({ pontos }) {
  if (!pontos.length) return <p className="text-[13px] text-muted">Defina o período.</p>;
  const W = 760, H = 230, pl = 74, pr = 14, pt = 12, pb = 26;
  const maxV = Math.max(1, ...pontos.map((p) => Math.max(p.deb, p.cred)));
  const passo = Math.pow(10, Math.floor(Math.log10(maxV))), topo = Math.ceil(maxV / passo) * passo;
  const x = (i) => pl + (pontos.length <= 1 ? 0 : (i * (W - pl - pr)) / (pontos.length - 1));
  const y = (v) => pt + (H - pt - pb) * (1 - v / topo);
  const linha = (k) => pontos.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[k]).toFixed(1)).join(" ");
  const cada = Math.max(1, Math.ceil(pontos.length / 8)), ult = pontos[pontos.length - 1];
  return (
    <div>
      <svg viewBox={"0 0 " + W + " " + H} className="w-full h-auto" role="img" aria-label="Débitos e créditos acumulados por dia">
        {[0, 1, 2, 3, 4].map((i) => { const v = (topo * i) / 4; return (
          <g key={i}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} className="stroke-line" />
            <text x={pl - 8} y={y(v) + 4} textAnchor="end" className="fill-muted text-[11px]">{fmtN.format(v).replace(/,00$/, "")}</text></g>); })}
        {pontos.map((p, i) => (i % cada === 0 || i === pontos.length - 1) && <text key={p.dia} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted text-[11px]">{p.dia.slice(8, 10)}/{p.dia.slice(5, 7)}</text>)}
        <path d={linha("deb")} fill="none" className="stroke-debit" strokeWidth="2.5" strokeLinejoin="round" />
        <path d={linha("cred")} fill="none" className="stroke-credit" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx={x(pontos.length - 1)} cy={y(ult.deb)} r="4" className="fill-debit" />
        <circle cx={x(pontos.length - 1)} cy={y(ult.cred)} r="4" className="fill-credit" />
      </svg>
      <div className="flex flex-wrap gap-4 text-[12.5px] text-ink-2">
        <span><i className="inline-block w-3 h-1 bg-debit align-middle mr-1.5 rounded" />Débitos acumulados das NF-e</span>
        <span><i className="inline-block w-3 h-1 bg-credit align-middle mr-1.5 rounded" />Créditos acumulados das NF-e</span>
      </div>
    </div>
  );
}

function CampoAjuste({ id, rotulo, dica, valor, aoGravar }) {
  const f = (v) => (v ? fmtN.format(v) : "");
  const [t, setT] = useState(f(valor));
  useEffect(() => { setT(f(valor)); }, [valor]);
  return (
    <label htmlFor={id} className="flex flex-col gap-1 min-w-[180px] flex-1">
      <span className="text-[12.5px] font-semibold text-ink-2">{rotulo}</span>
      <input id={id} value={t} inputMode="decimal" placeholder="0,00" className="text-right tabular-nums h-9"
        onChange={(e) => setT(e.target.value)} onBlur={() => { const v = lerValor(t); aoGravar(v); setT(f(v)); }} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />
      {dica && <span className="text-[11.5px] text-muted">{dica}</span>}
    </label>
  );
}

export default function Icms() {
  const [svc, versao] = useIcms();
  const { aviso, confirmar } = useAvisos();
  const [aba, setAba] = useState("S");
  const [tipo, setTipo] = useState("");
  const [busca, setBusca] = useState("");
  const [mostrar, setMostrar] = useState(100);
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef(null);
  const s = svc.estado();
  const tem = s.notas.size > 0;
  const regras = svc.regras();
  const ajustes = svc.ajustes();
  const R = useMemo(() => (tem ? apurar({ notas: svc.notas(), canceladas: s.canceladas, empresa: s.empresa, de: s.de, ate: s.ate, regras, ajustes }) : null), [versao]);   // eslint-disable-line
  const pontos = useMemo(() => (R ? acumulado(R.diario, s.de, s.ate) : []), [R]);   // eslint-disable-line
  const empresas = tem ? svc.empresas() : [];
  const emp = empresas.find((e) => e.doc === s.empresa) || { nome: "", doc: s.empresa };

  async function carregar(arquivos) {
    const textos = [];
    for (const f of Array.from(arquivos || [])) {
      const nome = (f.name || "").toLowerCase();
      try {
        if (nome.endsWith(".zip")) {
          const JSZip = await carregarJsZip();
          const zip = await JSZip.loadAsync(f);
          for (const e of Object.values(zip.files)) if (!e.dir && e.name.toLowerCase().endsWith(".xml")) textos.push({ nome: e.name, texto: await e.async("string") });
        } else if (nome.endsWith(".xml")) textos.push({ nome: f.name, texto: await f.text() });
        else svc.ignorarArquivo();
      } catch (err) { aviso("Não consegui abrir " + f.name + ": " + (err.message || err)); }
    }
    if (!textos.length) return;
    const r = svc.carregar(textos);
    setMostrar(100);
    aviso(r.lidas + " nota(s) lida(s)" + (r.cancelamentos ? ", " + r.cancelamentos + " cancelamento(s)" : "") + ".");
  }
  const exemplo = () => { svc.limpar(); const r = svc.carregar(xmlsDeExemplo().map((t, i) => ({ nome: "exemplo-" + i + ".xml", texto: t }))); aviso("Exemplo carregado: " + r.lidas + " notas fictícias."); };
  const limpar = async () => {
    if (!(await confirmar({ titulo: "Limpar as notas?", texto: "As notas saem da tela. As regras de CFOP e os ajustes continuam salvos.", botao: "Limpar" }))) return;
    svc.limpar(); setBusca(""); setTipo("");
  };

  async function exportar() {
    try {
      const XLSX = await carregarXlsx();
      const wb = XLSX.utils.book_new();
      const folha = (linhas, nome, moeda) => {
        const ws = XLSX.utils.aoa_to_sheet(linhas);
        Object.keys(ws).forEach((k) => { if (k[0] !== "!" && typeof ws[k].v === "number" && moeda.test(k)) ws[k].z = '"R$" #,##0.00'; });
        XLSX.utils.book_append_sheet(wb, ws, nome);
      };
      folha([["Apuração parcial de ICMS", ""], ["Prévia a partir das NF-e. A apuração oficial é a do Único.", ""], [], ["Empresa", emp.nome], ["CNPJ", docFmt(emp.doc)],
        ["Período", dataBr(s.de) + " a " + dataBr(s.ate)], ["Gerado em", new Date().toLocaleString("pt-BR")], [],
        ["Débitos das NF-e de saída", R.deb], ["Outros débitos e estornos de crédito", R.ajustes.outDeb], ["Total de débitos", R.debTot], [],
        ["Créditos das NF-e de entrada", R.cred], ["Outros créditos (CIAP, CT-e, presumido)", R.ajustes.outCred], ["Saldo credor do mês anterior", R.ajustes.saldoAnt], ["Total de créditos", R.credTot], [],
        [R.saldo >= 0 ? "ICMS A RECOLHER" : "SALDO CREDOR", Math.abs(R.saldo)], [], [R.nS + " nota(s) de saída · " + R.nE + " de entrada · " + R.nX + " cancelada(s) fora da conta", ""]], "Resumo", /^B/);
      folha([["Tipo", "CFOP", "CFOPs do fornecedor", "Notas", "Valor contábil", "Base de cálculo", "ICMS", "Entra na apuração", "ICMS apurado"]].concat(
        R.grupos.map((g) => [g.dir === "S" ? "Saída" : "Entrada", g.cfop, [...g.origens].sort().join(", "), g.notas.size, g.vc, g.bc, g.icms, g.entra ? "Sim" : "Não", g.entra ? g.icms : 0])), "Por CFOP", /^[EFGI]/);
      folha([["Emissão", "Modelo", "Série", "Número", "Tipo", "Participante", "CNPJ/CPF", "CFOPs", "Valor da nota", "ICMS apurado", "Situação", "Chave de acesso"]].concat(
        R.notas.map((x) => { const p = x.terceiros ? x.nota.emit : x.nota.dest; return [dataBr(x.nota.data), x.nota.mod === "65" ? "NFC-e" : "NF-e", x.nota.serie, x.nota.numero, x.dir === "S" ? "Saída" : "Entrada",
          p.nome || (p.doc ? "" : "Consumidor final"), docFmt(p.doc), x.cfops.join(", "), x.nota.vNF, x.cancelada ? 0 : x.apur, x.cancelada ? "Cancelada" : "Autorizada", x.nota.chave]; })), "Notas", /^[IJ]/);
      XLSX.writeFile(wb, "apuracao-icms-" + s.empresa + "-" + (s.ate || "").replace(/-/g, "") + ".xlsx");
    } catch (err) { aviso("Não consegui gerar a planilha: " + (err.message || err)); }
  }

  const soltar = {
    onDragOver: (ev) => { ev.preventDefault(); if (!arrastando) setArrastando(true); },
    onDragLeave: (ev) => { if (ev.currentTarget === ev.target) setArrastando(false); },
    onDrop: (ev) => { ev.preventDefault(); setArrastando(false); if (ev.dataTransfer.files.length) carregar(ev.dataTransfer.files); }
  };
  const entradaArq = <input ref={entrada} type="file" hidden multiple accept=".xml,.zip" onChange={(ev) => { carregar(ev.target.files); ev.target.value = ""; }} />;
  const sobreposicao = arrastando && <div className="absolute inset-0 z-20 rounded-2xl border-2 border-dashed border-brand bg-brand-soft/80 flex items-center justify-center text-[18px] font-semibold text-brand pointer-events-none">Solte os XML ou o .zip aqui</div>;

  if (!tem) {
    return (
      <div className="space-y-4 relative" {...soltar}>
        {entradaArq}{sobreposicao}
        <section className="cartao p-8 text-center space-y-4">
          <div><strong className="block text-[15px]">Prévia do ICMS do mês, direto das notas</strong>
            <span className="text-[13.5px] text-muted">Traga os XMLs de NF-e e NFC-e do cliente (SIEG ou S@T) ou o .zip. Os arquivos são lidos só neste navegador e não ficam guardados.</span></div>
          <button type="button" onClick={() => entrada.current.click()} className="w-full max-w-[560px] mx-auto block rounded-xl border-2 border-dashed border-line-strong bg-surface-2 px-6 py-8 hover:border-brand-fill">
            <strong className="block text-[14.5px]">Arraste os XML ou o .zip aqui, ou clique para escolher</strong>
            <span className="text-[13px] text-muted">Inclua os eventos de cancelamento, para as notas canceladas saírem da conta.</span>
          </button>
          <button type="button" className="btn-contorno btn-sm" onClick={exemplo}>Usar exemplo</button>
          <p className="text-[12.5px] text-muted">Esta é uma prévia para acompanhamento. A escrituração e a apuração oficial continuam no Único.</p>
        </section>
      </div>
    );
  }

  const recolher = R.saldo >= 0;
  const grupos = R.grupos.filter((g) => g.dir === aba);
  const tot = grupos.reduce((t, g) => { t.vc += g.vc; t.bc += g.bc; t.icms += g.icms; if (g.entra) t.apur += g.icms; g.notas.forEach((c) => t.notas.add(c)); return t; }, { vc: 0, bc: 0, icms: 0, apur: 0, notas: new Set() });
  const b = busca.trim().toLowerCase();
  const notas = R.notas.filter((x) => {
    if (tipo === "X") return x.cancelada;
    if (tipo && x.dir !== tipo) return false;
    if (b) { const p = x.terceiros ? x.nota.emit : x.nota.dest; if (![x.nota.numero, p.nome, p.doc, x.cfops.join(" "), x.nota.chave].join(" ").toLowerCase().includes(b)) return false; }
    return true;
  });
  const max = Math.max(R.debTot, R.credTot, 0.01), pct = (v) => (v / max) * 100 + "%";
  const ig = s.ignorados;
  const extras = [s.canceladas.size ? s.canceladas.size + " cancelamento(s)" : "", ig.resumos ? ig.resumos + " resumo(s) sem itens ignorado(s)" : "", ig.invalidos ? ig.invalidos + " arquivo(s) inválido(s)" : ""].filter(Boolean);

  return (
    <div className="space-y-4 relative" {...soltar}>
      {entradaArq}{sobreposicao}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 min-w-[260px] flex-1 max-w-[460px]"><span className="text-[12.5px] font-semibold text-ink-2">Empresa apurada</span>
          <select value={s.empresa} onChange={(e) => svc.definirEmpresa(e.target.value)} className="h-9">
            {empresas.slice(0, 30).map((e) => <option key={e.doc} value={e.doc}>{(e.nome || "Sem nome").slice(0, 40)} ({docFmt(e.doc)})</option>)}
          </select></label>
        <label className="flex flex-col gap-1"><span className="text-[12.5px] font-semibold text-ink-2">De</span><input type="date" value={s.de} onChange={(e) => svc.definirPeriodo(e.target.value, s.ate)} className="h-9" /></label>
        <label className="flex flex-col gap-1"><span className="text-[12.5px] font-semibold text-ink-2">Até</span><input type="date" value={s.ate} onChange={(e) => svc.definirPeriodo(s.de, e.target.value)} className="h-9" /></label>
        <div className="flex-1" />
        <button type="button" className="btn-contorno btn-sm" onClick={() => entrada.current.click()}>Adicionar notas</button>
        <button type="button" className="btn-primario btn-sm" onClick={exportar}>Baixar planilha (.xlsx)</button>
        <button type="button" className="btn-fantasma btn-sm" onClick={limpar}>Limpar</button>
      </div>
      <p className="text-[12.5px] text-muted"><b className="text-ink">{s.notas.size}</b> nota(s) carregada(s){extras.length ? " · " + extras.join(" · ") : ""}. Para a posição parcial do mês, deixe “De” no dia 1º e mude só o “Até”.</p>

      <section className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4">
        <div className="cartao p-5 space-y-4">
          <div>
            <div className="text-[13px] text-muted">{recolher ? "ICMS a recolher até agora" : "Saldo credor até agora"}</div>
            <div className={"text-[34px] font-semibold tabular-nums " + (recolher ? "text-debit" : "text-credit")}>{R$(Math.abs(R.saldo))}</div>
            <div className="text-[12.5px] text-muted">De {dataBr(s.de)} a {dataBr(s.ate)}</div>
          </div>
          {[["Débitos", R.debTot, R.deb, R.ajustes.outDeb, "bg-debit"], ["Créditos", R.credTot, R.cred, R.ajustes.outCred + R.ajustes.saldoAnt, "bg-credit"]].map(([nome, total, nfe, aj, cor]) => (
            <div key={nome} className="space-y-1">
              <div className="flex justify-between text-[13px]"><span className="font-semibold">{nome}</span><span className="tabular-nums font-semibold">{R$(total)}</span></div>
              <div className="h-3 rounded-full bg-surface-2 border border-line overflow-hidden flex"><div className={"h-full " + cor} style={{ width: pct(nfe) }} /><div className={"h-full opacity-40 " + cor} style={{ width: pct(aj) }} /></div>
            </div>
          ))}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] border-t border-line pt-3">
            {[["Débitos das NF-e", R$(R.deb)], ["Créditos das NF-e", R$(R.cred)], ["Ajustes (créditos)", R$(R.ajustes.outCred + R.ajustes.saldoAnt)], ["Ajustes (débitos)", R$(R.ajustes.outDeb)],
              ["Notas de saída", R.nS], ["Notas de entrada", R.nE], ["Canceladas", R.nX]].concat(R.fora ? [["De outras empresas", R.fora]] : []).map(([a, v]) => (
              <div key={a} className="flex justify-between gap-2"><dt className="text-muted">{a}</dt><dd className="tabular-nums font-medium">{v}</dd></div>
            ))}
          </dl>
        </div>
        <div className="cartao p-5 space-y-2"><h2 className="text-[15px] font-semibold">Evolução no período</h2><Grafico pontos={pontos} /></div>
      </section>

      <section className="cartao p-5 space-y-3">
        <div><h2 className="text-[15px] font-semibold">Ajustes manuais</h2><p className="text-[12.5px] text-muted">Valores que não aparecem nas NF-e. Ficam salvos neste navegador, por empresa e por mês.</p></div>
        <div className="flex flex-wrap gap-4">
          <CampoAjuste id="aj-saldo" rotulo="Saldo credor do mês anterior" valor={ajustes.saldoAnt} aoGravar={(v) => svc.definirAjuste("saldoAnt", v)} />
          <CampoAjuste id="aj-cred" rotulo="Outros créditos" dica="CIAP, ICMS do frete (CT-e), presumido, TTD" valor={ajustes.outCred} aoGravar={(v) => svc.definirAjuste("outCred", v)} />
          <CampoAjuste id="aj-deb" rotulo="Outros débitos e estornos de crédito" valor={ajustes.outDeb} aoGravar={(v) => svc.definirAjuste("outDeb", v)} />
        </div>
      </section>

      <section className="cartao overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 pt-3.5 pb-2">
          <h2 className="text-[15px] font-semibold">Por CFOP</h2>
          <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="tablist">
            {[["S", "Saídas (débito)"], ["E", "Entradas (crédito)"]].map(([id, nome]) => (
              <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
                className={"rounded-md px-3 py-1.5 text-[13px] " + (aba === id ? "bg-brand-soft text-brand font-semibold" : "text-ink-2")}>{nome}</button>
            ))}
          </div>
          <div className="flex-1" />
          <button type="button" className="btn-fantasma btn-sm" onClick={() => { svc.restaurarRegras(); aviso("Regras padrão restauradas."); }}>Restaurar regras padrão</button>
        </div>
        <div className="overflow-x-auto relative">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 text-[11.5px] uppercase tracking-wide text-muted">
              <tr><th className="px-4 py-2 text-left font-semibold">CFOP</th><th className="px-2 py-2 text-right font-semibold">Notas</th><th className="px-2 py-2 text-right font-semibold">Valor contábil</th>
                <th className="px-2 py-2 text-right font-semibold">Base ICMS</th><th className="px-2 py-2 text-right font-semibold">ICMS</th><th className="px-4 py-2 text-left font-semibold">Entra no {aba === "S" ? "débito" : "crédito"}?</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {!grupos.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">Nenhuma nota de {aba === "S" ? "saída" : "entrada"} no período.</td></tr>}
              {grupos.map((g) => {
                const k = g.dir + ":" + g.cfop, mudou = k in regras && regras[k] !== regraPadrao(g.dir, g.cfop);
                return (
                  <tr key={k} className={g.entra ? "" : "text-muted"}>
                    <td className="px-4 py-1.5"><b className={g.entra ? "" : "line-through"}>{g.cfop}</b>
                      {g.origens.size > 0 && <span className="block text-[11.5px] text-muted">do fornecedor: {[...g.origens].sort().join(", ")}</span>}
                      {g.credSN > 0 && <span className="block text-[11.5px] text-muted">inclui {R$(g.credSN)} de crédito do Simples</span>}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{g.notas.size}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{R$(g.vc)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{R$(g.bc)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{R$(g.icms)}</td>
                    <td className="px-4 py-1.5"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={g.entra} onChange={(e) => svc.definirRegra(k, e.target.checked)} aria-label={"CFOP " + g.cfop + " entra na apuração"} />
                      {g.entra ? "Entra" : "Não entra"}{mudou ? " (alterado)" : ""}</label></td>
                  </tr>
                );
              })}
            </tbody>
            {grupos.length > 0 && (
              <tfoot className="bg-surface-2 font-semibold"><tr><td className="px-4 py-2">Total</td><td className="px-2 py-2 text-right tabular-nums">{tot.notas.size}</td>
                <td className="px-2 py-2 text-right tabular-nums">{R$(tot.vc)}</td><td className="px-2 py-2 text-right tabular-nums">{R$(tot.bc)}</td><td className="px-2 py-2 text-right tabular-nums">{R$(tot.icms)}</td>
                <td className="px-4 py-2">{aba === "S" ? "Débito" : "Crédito"}: {R$(tot.apur)}</td></tr></tfoot>
            )}
          </table>
        </div>
        <p className="px-4 py-3 text-[12.5px] text-muted">{aba === "E"
          ? "Nas notas de fornecedores o CFOP mostrado é o de entrada equivalente. Desmarque o que for uso e consumo, ativo ou não gerar crédito. As regras valem para todas as empresas neste navegador."
          : "5929/6929 vêm desmarcados porque repetem vendas já registradas em cupom ou NFC-e. As regras valem para todas as empresas neste navegador."}</p>
      </section>

      <section className="cartao overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3.5 pb-2">
          <h2 className="text-[15px] font-semibold mr-2">Notas</h2>
          <select value={tipo} onChange={(e) => { setTipo(e.target.value); setMostrar(100); }} aria-label="Tipo de nota" className="h-9 w-auto">
            <option value="">Todas</option><option value="S">Saídas</option><option value="E">Entradas</option><option value="X">Canceladas</option>
          </select>
          <input type="search" value={busca} onChange={(e) => { setBusca(e.target.value); setMostrar(100); }} placeholder="Número, participante, CFOP ou chave…" aria-label="Buscar nota" className="h-9 max-w-[300px]" />
          <span className="text-[12.5px] text-muted">{notas.length} nota(s)</span>
        </div>
        <div className="overflow-x-auto relative">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 text-[11.5px] uppercase tracking-wide text-muted">
              <tr><th className="px-4 py-2 text-left font-semibold">Emissão</th><th className="px-2 py-2 text-left font-semibold">Nº</th><th className="px-2 py-2 text-left font-semibold">Tipo</th>
                <th className="px-2 py-2 text-left font-semibold">Participante</th><th className="px-2 py-2 text-left font-semibold">CFOP</th><th className="px-2 py-2 text-right font-semibold">Valor da nota</th><th className="px-4 py-2 text-right font-semibold">ICMS apurado</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {!notas.length && <tr><td colSpan={7} className="px-4 py-6 text-center text-muted">Nenhuma nota com esse filtro.</td></tr>}
              {notas.slice(0, mostrar).map((x) => {
                const p = x.terceiros ? x.nota.emit : x.nota.dest;
                return (
                  <tr key={x.nota.chave} className={x.cancelada ? "text-muted" : ""}>
                    <td className="px-4 py-1.5 whitespace-nowrap">{dataBr(x.nota.data)}</td>
                    <td className="px-2 py-1.5">{x.nota.numero}{x.nota.mod === "65" && <span className="text-[11px] text-muted"> NFC-e</span>}</td>
                    <td className="px-2 py-1.5">{x.cancelada ? <Selo tipo="neutro">Cancelada</Selo> : x.dir === "S" ? <Selo tipo="erro">Saída</Selo> : <Selo tipo="ok">Entrada</Selo>}</td>
                    <td className="px-2 py-1.5" title={docFmt(p.doc)}><span className="block truncate max-w-[280px]">{p.nome || (p.doc ? docFmt(p.doc) : "Consumidor final")}</span></td>
                    <td className="px-2 py-1.5">{x.cfops.join(", ")}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{R$(x.nota.vNF)}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{x.cancelada ? "—" : R$(x.apur)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {notas.length > mostrar && <div className="p-3 text-center"><button type="button" className="btn-contorno btn-sm" onClick={() => setMostrar(mostrar + 100)}>Mostrar mais ({notas.length - mostrar} restantes)</button></div>}
      </section>
      <p className="text-[12.5px] text-muted">Prévia para acompanhamento. Diferenças esperadas em relação ao Único: o destino das compras (uso e consumo pode vir como revenda), a data (aqui é a de emissão), CT-e e benefícios (vão nos ajustes) e notas canceladas sem o evento.</p>
    </div>
  );
}
