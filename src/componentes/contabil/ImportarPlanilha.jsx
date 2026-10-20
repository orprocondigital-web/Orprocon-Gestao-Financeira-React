import { useEffect, useState } from "react";
import { Importacao } from "../../lib/legado.js";
import { contabil } from "../../lib/useContabil.js";
import { lerPlanilha } from "../../lib/leitores.js";
import { useAvisos } from "../Avisos.jsx";
import Janela from "../Janela.jsx";
import { BotaoArquivo, Campo, Selo, numero } from "./ui.jsx";

/** A planilha do mês inteira (.xlsm/.xlsx): contas, movimentos e cadastros de uma vez, já distribuídos. */
export default function ImportarPlanilha({ aberta, aoFechar, aoConcluir }) {
  const { confirmar } = useAvisos();
  const [arquivo, setArquivo] = useState("");
  const [status, setStatus] = useState("");
  const [plano, setPlano] = useState(null);
  const [mes, setMes] = useState("");
  const [comCadastros, setComCadastros] = useState(true);
  useEffect(() => { if (aberta) { setArquivo(""); setStatus(""); setPlano(null); setComCadastros(true); } }, [aberta]);
  if (!aberta) return null;

  const ler = async (file) => {
    setArquivo(file.name); setPlano(null);
    setStatus("Lendo a planilha… pode levar alguns segundos.");
    try {
      const p = Importacao.analisarPlanilha(await lerPlanilha(file));
      if (!p.bancos.length && !p.movimentos.length) { setStatus("Não encontrei abas de banco (nome terminando em \"Conta <número>\") nesta planilha."); return; }
      setPlano(p); setMes(p.competencia || contabil.competencia()); setStatus("");
    } catch (e) { setStatus("Não consegui ler a planilha: " + (e.message || "erro desconhecido")); }
  };
  const importar = async () => {
    if (!/^\d{4}-\d{2}$/.test(mes)) { setStatus("Escolha a competência (mês)."); return; }
    if (contabil.competenciasComDados()[mes] && !(await confirmar({ titulo: "Substituir o mês?", perigo: true, botao: "Substituir",
      texto: Importacao.nomeCompetencia(mes) + " já tem lançamentos neste navegador. As contas que estão na planilha ficam com os lançamentos dela." }))) return;
    try {
      const msg = contabil.aplicarPlanilha(plano, mes, comCadastros);
      aoFechar();
      if (aoConcluir) aoConcluir({ msg, aviso: plano.avisos.length > 0 });
    } catch (e) { setStatus(e.message); }
  };
  const resumo = plano ? contabil.resumoPlano(plano) : null;

  return (
    <Janela aberta titulo="Importar a planilha do mês" aoFechar={aoFechar} largura="max-w-[640px]"
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
        <button type="button" className="btn-primario" disabled={!plano} onClick={importar}>Importar</button></>}>
      <p className="text-[13.5px] text-ink-2">A planilha inteira (.xlsm ou .xlsx): cada aba de banco vira uma conta, os movimentos e os cadastros entram junto, e os lançamentos já são distribuídos por unidade.</p>
      <div className="flex flex-wrap items-center gap-3">
        <BotaoArquivo className="btn-contorno" aceita=".xlsm,.xlsx,.xls" aoEscolher={ler}>Escolher a planilha</BotaoArquivo>
        <span className="text-[13px] text-muted break-all">{arquivo || "nenhum arquivo escolhido"}</span>
      </div>
      {status && <p className="text-[13px] text-ink-2" role="status">{status}</p>}
      {resumo && (<>
        <div className="rounded-lg border border-line divide-y divide-line max-h-[260px] overflow-y-auto">
          {resumo.linhas.map((l, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-[13.5px]">
              <span className="min-w-0">{l.nome} {l.nova && <Selo tipo="novo">nova conta</Selo>}</span>
              <span className="whitespace-nowrap text-muted tabular-nums">{numero(l.qtd)} {l.tipo}</span>
            </div>
          ))}
        </div>
        {plano.avisos.length > 0 && (
          <ul className="space-y-1.5 text-[13px] text-warn">{plano.avisos.map((a, i) => <li key={i}><strong>Atenção:</strong> {a}</li>)}</ul>
        )}
        {plano.ignoradas.length > 0 && <p className="text-[12.5px] text-muted">Abas ignoradas: {plano.ignoradas.map((x) => x.nome.trim()).join(", ")}.</p>}
        <div className="grid sm:grid-cols-2 gap-3 items-end">
          <Campo rotulo="Competência" id="imp-mes"><input id="imp-mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} /></Campo>
          <label className="flex items-start gap-2 text-[13.5px] pb-2"><input type="checkbox" className="mt-1" checked={comCadastros} onChange={(e) => setComCadastros(e.target.checked)} />
            Atualizar os cadastros (clientes, fornecedores, plano de contas e tabelas)</label>
        </div>
      </>)}
    </Janela>
  );
}
