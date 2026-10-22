import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Importacao } from "../lib/legado.js";
import { REGIMES, MESES } from "../lib/depCadastro.mjs";
import { ehMesmaPessoa } from "../lib/emDia.mjs";
import { useEmDia } from "../lib/useEmDia.js";
import { useAuth } from "../lib/auth.jsx";
import { carregarXlsx } from "../lib/leitores.js";
import { useAvisos } from "../componentes/Avisos.jsx";
import { dataBR, numero } from "../componentes/contabil/ui.jsx";

/*
 * Fechamento contábil: um visto por empresa e mês ("mês fechado"), como o "Contabilidade › Minhas empresas"
 * do sistema do Depto. Contábil. A filial segue a matriz. Regras em src/lib/emDia.mjs (fechamento).
 */
const mesTexto = (m) => Importacao.nomeCompetencia(m).replace(" de ", "/");

function Barra({ pct }) {
  const v = pct === null ? 0 : pct;
  const cor = v === 100 ? "bg-credit" : v >= 50 ? "bg-brand-fill" : "bg-debit";
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="h-2 flex-1 rounded-full bg-surface-2 border border-line overflow-hidden"><div className={"h-full " + cor} style={{ width: v + "%" }} /></div>
      <span className="text-[12.5px] font-semibold tabular-nums w-[38px] text-right">{pct === null ? "—" : pct + "%"}</span>
    </div>
  );
}

export default function Fechamento() {
  const [svc, versao] = useEmDia();
  const { usuario } = useAuth();
  const { aviso } = useAvisos();
  const [ano, setAno] = useState(svc.mesPadrao().slice(0, 4));
  const [pessoa, setPessoa] = useState("");
  const [regime, setRegime] = useState("");
  const [matrizes, setMatrizes] = useState(false);
  const [busca, setBusca] = useState("");
  const f = useMemo(() => svc.fechamento(ano, { pessoa, regime, matrizes, busca }), [svc, ano, pessoa, regime, matrizes, busca, versao]);   // eslint-disable-line
  const todos = useMemo(() => svc.fechamento(ano), [svc, ano, versao]);   // eslint-disable-line
  const eu = usuario ? { nome: usuario.nome, email: usuario.email } : null;
  const meu = eu ? todos.equipe.find((p) => ehMesmaPessoa(p.pessoa, eu)) : null;
  const trabalho = svc.mesPadrao();
  const alternar = (l, c) => {
    if (l.filial || c.estado === "fora") return;
    svc.marcarFechado(l.empresa.id, c.mes, c.estado !== "fechado", eu ? eu.nome : "");
  };
  const baixar = async () => {
    try {
      const XLSX = await carregarXlsx();
      const cab = ["Empresa", "CNPJ", "Regime", "Tipo", "Responsável"].concat(MESES, ["% até " + mesTexto(f.ate)]);
      const linhas = [cab].concat(f.linhas.map((l) => [l.empresa.nome, l.empresa.documento || "", l.empresa.regime || "", l.filial ? "Filial" : "Matriz", l.responsavel]
        .concat(l.meses.map((c) => (c.estado === "fechado" ? "Fechado" : c.estado === "fora" ? "—" : "")), [l.pct === null ? "" : l.pct / 100])));
      const ws = XLSX.utils.aoa_to_sheet(linhas);
      Object.keys(ws).forEach((k) => { if (k[0] !== "!" && typeof ws[k].v === "number") ws[k].z = "0%"; });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Fechamento " + ano);
      XLSX.writeFile(wb, "fechamento-contabil-" + ano + ".xlsx");
    } catch (e) { aviso("Não consegui gerar o Excel: " + (e.message || e)); }
  };
  const chip = (on) => "rounded-full border px-3 py-1 text-[13px] " + (on ? "bg-brand-soft border-brand text-brand font-semibold" : "border-line bg-surface");
  if (!svc.empresas().length) {
    return (
      <div className="cartao p-10 text-center space-y-3">
        <strong className="block text-[15px]">Nenhuma empresa cadastrada</strong>
        <span className="block text-[13.5px] text-muted">As empresas vêm do cadastro do Departamento Cadastro, e o responsável é o do setor Contábil.</span>
        <Link to="/departamento-cadastro/empresas" className="btn-contorno btn-sm">Abrir Empresas</Link>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-line bg-surface">
          <button type="button" className="btn-fantasma h-9 w-9 p-0" onClick={() => setAno(String(Number(ano) - 1))} aria-label="Ano anterior">‹</button>
          <span className="px-2 text-[14px] font-semibold min-w-[70px] text-center">{ano}</span>
          <button type="button" className="btn-fantasma h-9 w-9 p-0" onClick={() => setAno(String(Number(ano) + 1))} aria-label="Próximo ano">›</button>
        </div>
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa ou CNPJ…" aria-label="Buscar empresa" className="max-w-[240px] h-9" />
        <select value={regime} onChange={(e) => setRegime(e.target.value)} aria-label="Regime" className="h-9 w-auto">
          <option value="">Todos os regimes</option>{REGIMES.map((x) => <option key={x} value={x}>{x}</option>)}<option value="(sem)">Sem regime</option>
        </select>
        <label className="inline-flex items-center gap-2 text-[13.5px]"><input type="checkbox" checked={matrizes} onChange={(e) => setMatrizes(e.target.checked)} /> Só matrizes</label>
        <div className="flex-1" />
        <button type="button" className="btn-contorno btn-sm" onClick={baixar}>Baixar Excel</button>
      </div>

      <section className="cartao p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <strong className="text-[16px]">{todos.pct === null ? 0 : todos.pct}% fechado até {mesTexto(todos.ate).toLowerCase()}</strong>
          <span className="text-[13px] text-muted">{numero(todos.feitos)} de {numero(todos.total)} meses (matrizes)</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setPessoa("")} className={chip(!pessoa)}>Todos</button>
          {meu && <button type="button" onClick={() => setPessoa(meu.pessoa)} className={chip(pessoa === meu.pessoa)}>Minhas · {meu.pct === null ? 0 : meu.pct}%</button>}
          {todos.equipe.filter((p) => p !== meu).map((p) => {
            const k = p.pessoa === "(sem responsável)" ? "(sem)" : p.pessoa;
            return <button key={p.pessoa} type="button" onClick={() => setPessoa(k)} className={chip(pessoa === k)}>{p.pessoa} · {p.pct === null ? 0 : p.pct}%</button>;
          })}
        </div>
      </section>

      <div className="cartao overflow-hidden">
        <div className="overflow-x-auto relative">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 text-[12px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2.5 font-semibold text-left min-w-[220px] sticky left-0 bg-surface-2 z-10">Empresa</th>
                <th className="px-2 py-2.5 font-semibold text-left">Responsável</th>
                {f.meses.map((m, i) => <th key={m} className={"px-0.5 py-2.5 font-semibold text-center w-[40px] " + (m === trabalho ? "text-brand" : "")}>{MESES[i]}</th>)}
                <th className="px-3 py-2.5 font-semibold text-left">Progresso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {!f.linhas.length && <tr><td colSpan={15} className="px-3 py-8 text-center text-muted">Nenhuma empresa com esse filtro.</td></tr>}
              {f.linhas.map((l) => (
                <tr key={l.empresa.id} className={"group hover:bg-surface-2 " + (l.filial ? "text-ink-2" : "")}>
                  <td className="px-3 py-1.5 sticky left-0 bg-surface group-hover:bg-surface-2 z-10">
                    <span className={"block truncate max-w-[300px] " + (l.filial ? "pl-4 text-[12.5px]" : "font-medium")}>{l.filial ? "↳ " : ""}{l.empresa.nome}</span>
                    <span className="block text-[11.5px] text-muted">{l.empresa.regime || "sem regime"}{l.filial ? " · segue a matriz" : ""}</span>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{l.filial ? "" : (l.responsavel || <span className="text-muted">—</span>)}</td>
                  {l.meses.map((c, i) => (
                    <td key={c.mes} className="px-0.5 py-1 text-center">
                      {c.estado === "fora" ? <span className="text-muted" title="Não era cliente neste mês">—</span> : (
                        <button type="button" onClick={() => alternar(l, c)} disabled={l.filial} aria-pressed={c.estado === "fechado"}
                          aria-label={l.empresa.nome + ", " + mesTexto(c.mes) + ": " + (c.estado === "fechado" ? "fechado" : "aberto")}
                          title={l.filial ? "Segue a matriz" : c.estado === "fechado" ? "Fechado" + (c.por ? " por " + c.por : "") + (c.em ? " em " + dataBR(c.em) : "") + " (clique para reabrir)" : "Clique para marcar o mês como fechado"}
                          className={"h-7 w-7 rounded-md border inline-flex items-center justify-center text-[13px] font-bold transition-colors " +
                            (c.estado === "fechado" ? (l.filial ? "bg-ok-soft/60 border-credit/20 text-credit/70" : "bg-credit border-credit text-white") :
                              c.mes < trabalho ? "border-debit/40 bg-debit-soft hover:border-debit" : c.mes === trabalho ? "border-brand-fill bg-brand-soft hover:bg-brand-fill/30" : "border-line-strong bg-surface hover:border-brand-fill") +
                            (l.filial ? " cursor-default" : "")}>{c.estado === "fechado" ? "✓" : ""}</button>
                      )}
                      <span className="sr-only">{MESES[i]}</span>
                    </td>
                  ))}
                  <td className="px-3 py-1.5">{l.filial ? null : <Barra pct={l.pct} />}</td>
                </tr>
              ))}
            </tbody>
            {f.linhas.length > 0 && (
              <tfoot className="bg-surface-2 font-semibold"><tr>
                <td className="px-3 py-2 sticky left-0 bg-surface-2">Fechadas</td><td />
                {f.totais.map((t, i) => <td key={i} className="px-0.5 py-2 text-center tabular-nums text-[12px]">{t.total ? t.feitos + "/" + t.total : "—"}</td>)}
                <td className="px-3 py-2"><Barra pct={f.pct} /></td>
              </tr></tfoot>
            )}
          </table>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
        <span><span className="inline-block w-3.5 h-3.5 rounded bg-credit align-middle mr-1" />Fechado</span>
        <span><span className="inline-block w-3.5 h-3.5 rounded border border-brand-fill bg-brand-soft align-middle mr-1" />Mês de trabalho ({mesTexto(trabalho)})</span>
        <span><span className="inline-block w-3.5 h-3.5 rounded border border-debit/40 bg-debit-soft align-middle mr-1" />Mês que passou, aberto</span>
        <span>— não era cliente no mês · a filial segue a matriz e não conta nos totais</span>
      </div>

      {f.equipe.length > 0 && (
        <section className="cartao overflow-hidden">
          <h2 className="px-4 pt-3.5 pb-2 text-[15px] font-semibold">Equipe mês a mês</h2>
          <div className="overflow-x-auto relative">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-[12px] uppercase tracking-wide text-muted">
                <tr><th className="px-3 py-2.5 font-semibold text-left min-w-[160px]">Pessoa</th>
                  {f.meses.map((m, i) => <th key={m} className="px-1 py-2.5 font-semibold text-center">{MESES[i]}</th>)}
                  <th className="px-3 py-2.5 font-semibold text-left">Até {MESES[Number(f.ate.slice(5)) - 1].toLowerCase()}</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {f.equipe.map((p) => (
                  <tr key={p.pessoa}>
                    <td className="px-3 py-1.5 font-medium">{p.pessoa}</td>
                    {p.meses.map((m, i) => <td key={i} className={"px-1 py-1.5 text-center tabular-nums text-[12.5px] " + (m.pct === 100 ? "text-credit font-semibold" : m.pct === null ? "text-muted" : f.meses[i] < trabalho ? "text-debit" : "")}>{m.pct === null ? "—" : m.pct + "%"}</td>)}
                    <td className="px-3 py-1.5"><Barra pct={p.pct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <p className="text-[12.5px] text-muted">Clique no quadrado do mês para marcar como fechado (e de novo para reabrir). As empresas e o período de cliente vêm do Departamento Cadastro; o responsável é o do setor Contábil no Em Dia, em cada mês.</p>
    </div>
  );
}
