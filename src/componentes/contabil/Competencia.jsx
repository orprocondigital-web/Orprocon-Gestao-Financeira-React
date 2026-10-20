import { useState } from "react";
import { useContabil } from "../../lib/useContabil.js";
import { useAvisos } from "../Avisos.jsx";
import Janela from "../Janela.jsx";

/** Mês de trabalho (competência), no topo das telas da Integração contábil. Vale para todas as contas. */
export default function Competencia() {
  const [svc] = useContabil();
  const { aviso } = useAvisos();
  const [outro, setOutro] = useState(false);
  const [mes, setMes] = useState("");
  const lista = svc.listaCompetencias();
  const atual = svc.competencia();
  const trocar = (m) => {
    const item = lista.find((x) => x.mes === m);
    if (svc.definirCompetencia(m)) aviso("Competência: " + (item ? item.nome : m));
  };
  return (
    <>
      <label className="inline-flex items-center gap-2 text-[13px] text-muted">
        <span className="hidden sm:inline">Mês</span>
        <select value={atual} aria-label="Competência (mês de trabalho)" className="h-10 w-auto min-w-[190px] font-semibold text-ink"
          onChange={(e) => { if (e.target.value === "outro") { setMes(atual); setOutro(true); } else trocar(e.target.value); }}>
          {lista.map((m) => <option key={m.mes} value={m.mes}>{m.nome}{m.vazio ? " (vazio)" : ""}</option>)}
          <option value="outro">Outro mês…</option>
        </select>
      </label>
      <Janela aberta={outro} titulo="Escolher outro mês" aoFechar={() => setOutro(false)}
        rodape={<><button type="button" className="btn-fantasma" onClick={() => setOutro(false)}>Cancelar</button>
          <button type="button" className="btn-primario" disabled={!/^\d{4}-\d{2}$/.test(mes)} onClick={() => { svc.definirCompetencia(mes); setOutro(false); aviso("Competência trocada."); }}>Abrir</button></>}>
        <label className="space-y-1.5 block"><span className="rotulo">Competência</span>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} data-foco /></label>
      </Janela>
    </>
  );
}
