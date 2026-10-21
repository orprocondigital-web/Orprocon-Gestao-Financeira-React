import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modulos } from "../lib/legado.js";
import { migrarUmaVez, useContabil } from "../lib/useContabil.js";
import { baixarArquivos, lerTexto } from "../lib/leitores.js";
import { useAvisos } from "../componentes/Avisos.jsx";
import Janela from "../componentes/Janela.jsx";
import Icone from "../componentes/Icone.jsx";
import ImportarPlanilha from "../componentes/contabil/ImportarPlanilha.jsx";
import ImportarExtratos from "../componentes/contabil/ImportarExtratos.jsx";
import NovaConta from "../componentes/contabil/NovaConta.jsx";
import { BotaoArquivo, Mensagem, numero } from "../componentes/contabil/ui.jsx";

/*
 * Integração contábil (a antiga "Master"): o mês inteiro num lugar só. Importar a planilha ou os extratos,
 * ver o que falta classificar, distribuir por unidade e gerar os TXTs para o Único.
 */
function ApagarTudo({ aoFechar }) {
  const [svc] = useContabil();
  const [txt, setTxt] = useState("");
  const ok = txt.trim().toUpperCase() === "APAGAR";
  return (
    <Janela aberta titulo="Apagar todos os dados?" aoFechar={aoFechar}
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
        <button type="button" disabled={!ok} className="btn bg-debit text-white hover:opacity-90" onClick={() => svc.apagarTudo().then(() => location.reload())}>Apagar tudo</button></>}>
      <p className="text-[14px] leading-relaxed text-ink-2">Apaga os dados da Central Orprocon neste navegador: meses, contas, unidades, cadastros e conciliações.
        Os usuários e os módulos (ICMS, IBS/CBS, vencimentos…) continuam. Baixe o backup antes se quiser guardar.</p>
      <label className="space-y-1.5 block"><span className="rotulo">Para confirmar, digite APAGAR</span>
        <input value={txt} onChange={(e) => setTxt(e.target.value)} autoComplete="off" data-foco /></label>
    </Janela>
  );
}

function Tabela({ titulo, linhas, vazio, colunas, aoAbrir }) {
  return (
    <section className="cartao overflow-hidden">
      <h2 className="px-4 pt-3.5 pb-2 text-[15px] font-semibold">{titulo}</h2>
      <div className="overflow-x-auto relative">
        <table className="w-full text-[13.5px]">
          <thead className="bg-surface-2 text-[12px] uppercase tracking-wide text-muted">
            <tr>{colunas.map((c, i) => <th key={c} className={"px-4 py-2 font-semibold " + (i ? "text-right" : "text-left")}>{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {!linhas.length && <tr><td colSpan={colunas.length} className="px-4 py-6 text-center text-muted">{vazio}</td></tr>}
            {linhas.map((l) => (
              <tr key={l.chave} className={l.para ? "cursor-pointer hover:bg-surface-2" : ""} onClick={l.para ? () => aoAbrir(l.para) : undefined}
                tabIndex={l.para ? 0 : undefined} onKeyDown={l.para ? (e) => { if (e.key === "Enter") aoAbrir(l.para); } : undefined}>
                {l.celulas.map((c, i) => <td key={i} className={"px-4 py-2 " + (i ? "text-right tabular-nums whitespace-nowrap" : "")}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Integracao() {
  const [svc, versao] = useContabil();
  const { aviso, confirmar } = useAvisos();
  const navegar = useNavigate();
  const p = useMemo(() => svc.painel(), [svc, versao]);   // eslint-disable-line
  const [janela, setJanela] = useState("");   // planilha | extratos | conta | apagar
  const [msg, setMsg] = useState({ texto: "", tipo: "info" });
  useEffect(() => { migrarUmaVez(); }, []);

  const distribuir = () => {
    const r = svc.distribuir();
    setMsg(r ? { texto: r.msg, tipo: r.semConta ? "aviso" : "info" } : { texto: "Nenhum lançamento classificado. Preencha categoria e unidade nas contas bancárias.", tipo: "aviso" });
    if (r) aviso("Distribuição concluída.");
  };
  const gerar = async (formato) => {
    const pre = svc.preverTxts();
    if (pre.erro) { setMsg({ texto: pre.erro, tipo: "aviso" }); return; }
    if (pre.sugeridos && !(await confirmar({ titulo: "Há sugestões sem conferir", botao: "Gerar assim mesmo",
      texto: numero(pre.sugeridos) + " lançamento(s) estão com a classificação sugerida pelo histórico e ainda não foram conferidos." }))) return;
    if (pre.semConta && !(await confirmar({ titulo: "Lançamentos incompletos", botao: "Gerar só os completos",
      texto: numero(pre.semConta) + " lançamento(s) estão sem conta de débito/crédito ou com valor fora do padrão, e seriam recusados ou gravados errado no Único.\n\nGerar os TXTs só com os completos baixa também a lista de pendências para corrigir." }))) return;
    const r = svc.gerarTxts(formato);
    if (r.erro) { setMsg({ texto: r.erro, tipo: "aviso" }); return; }
    baixarArquivos(r.arquivos);
    setMsg({ texto: r.msg, tipo: "info" });
  };
  const zerar = async () => {
    const z = svc.zerarMes();
    if (!z.qtd) { aviso(z.nome + " já está vazio."); return; }
    if (!(await confirmar({ titulo: "Zerar " + z.nome + "?", perigo: true, botao: "Apagar " + numero(z.qtd) + " lançamentos",
      texto: "Vale para todas as contas, movimentos e unidades deste mês. Contas bancárias, cadastros e os outros meses continuam.\n\nSe quiser guardar como está, baixe o backup antes." }))) return;
    await z.executar();
    setMsg({ texto: z.nome + " foi zerado. Pode importar outra planilha ou os extratos do mês.", tipo: "info" });
  };
  const excluirUnidades = async () => {
    const qtd = svc.unidades().length;
    if (!qtd) { aviso("Não há unidades para excluir."); return; }
    if (!(await confirmar({ titulo: "Excluir as " + qtd + " unidades?", perigo: true, botao: "Excluir unidades",
      texto: "Os lançamentos das contas bancárias não são apagados. Depois use Distribuir por unidade: as unidades são criadas de novo com os nomes certos." }))) return;
    svc.excluirUnidades(); aviso("Unidades excluídas.");
  };
  const baixarBackup = () => {
    const hoje = new Date().toISOString().slice(0, 10);
    baixarArquivos([{ nome: "backup-gestao-financeira-" + hoje + ".json", conteudo: JSON.stringify(svc.backup(Modulos.dadosParaBackup())), tipo: "application/json" }]);
    aviso("Backup baixado. Guarde o arquivo numa pasta da rede ou no Drive.");
  };
  const restaurar = async (file) => {
    try {
      const b = svc.lerBackup(await lerTexto(file));
      if (!(await confirmar({ titulo: "Restaurar o backup de " + b.quando + "?", perigo: true, botao: "Restaurar",
        texto: "Os dados deste navegador serão substituídos pelos do backup. Os usuários continuam como estão." }))) return;
      await b.aplicar(Modulos.restaurarDados);
      location.reload();
    } catch (e) { setMsg({ texto: e.message, tipo: "erro" }); }
  };

  const vazio = p.total === 0;
  return (
    <div className="space-y-4 max-w-[1200px]">
      {/* importar */}
      <section className="cartao p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-[12px] uppercase tracking-wider text-muted font-semibold">Mês</div>
          <div className="text-[19px] font-semibold">{p.nomeMes}</div>
          <p className="text-[13.5px] text-muted mt-1 max-w-[620px]">Importe a planilha do mês inteira, ou direto os extratos do banco: cada lançamento vai para a conta certa, sem duplicar, já com a classificação sugerida pelo histórico.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primario" onClick={() => setJanela("planilha")}>Importar planilha do mês</button>
          <button type="button" className="btn-contorno" onClick={() => setJanela("extratos")}>Importar extratos do banco</button>
          <button type="button" className="btn-contorno" onClick={() => setJanela("conta")}><Icone nome="mais" />Nova conta</button>
        </div>
      </section>

      <Mensagem texto={msg.texto} tipo={msg.tipo} aoFechar={() => setMsg({ texto: "" })} />

      {/* andamento + ações */}
      <section className="cartao p-4 sm:p-5 space-y-4">
        {vazio ? (
          <div><h2 className="text-[17px] font-semibold">Nenhum lançamento em {p.nomeMes}</h2>
            <p className="text-[13.5px] text-muted">Cadastre as contas bancárias e importe a planilha ou os extratos. Depois classifique categoria e unidade em cada conta.</p></div>
        ) : (<>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-[17px] font-semibold">{numero(p.classificados)} de {numero(p.total)} lançamentos classificados</h2>
            <div className="text-[13.5px] text-muted">
              {p.sugeridos > 0 && <>Sugeridas para conferir <strong className="text-info">{numero(p.sugeridos)}</strong> · </>}
              Pendentes <strong className={p.pendentes ? "text-debit" : "text-credit"}>{numero(p.pendentes)}</strong>
            </div>
          </div>
          <div className="h-2.5 rounded-full bg-debit-soft overflow-hidden" role="img" aria-label={p.pct + "% classificado"}>
            <div className="h-full bg-credit rounded-full transition-all" style={{ width: p.pct + "%" }} />
          </div>
        </>)}
        <div className="grid sm:grid-cols-3 gap-3 pt-1">
          {[
            ["Distribuir por unidade", "Monta as abas de unidade com as contas de débito e crédito.", distribuir],
            ["Gerar TXTs (formato atual)", "Um arquivo por unidade e categoria, separado por tabulação.", () => gerar("atual")],
            ["Gerar TXTs (SCI Único)", "Um arquivo por unidade no layout de importação do Único.", () => gerar("unico")]
          ].map(([t, d, f]) => (
            <button key={t} type="button" onClick={f} disabled={vazio}
              className="text-left rounded-xl border border-line bg-surface-2 hover:border-brand-fill px-4 py-3 disabled:opacity-50 disabled:cursor-not-allowed">
              <strong className="block text-[14px]">{t}</strong><span className="text-[12.5px] text-muted">{d}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid xl:grid-cols-2 gap-4 items-start">
        <Tabela titulo="Unidades" colunas={["Unidade", "Classificados", "Pendentes", "Total", "Completo"]} aoAbrir={navegar}
          vazio="Sem lançamentos classificados por unidade."
          linhas={p.unidades.map((u) => ({ chave: u.nome, para: u.id ? "/conta/" + u.id : null, celulas: [
            <span key="n">{u.nome}{!u.id && <span className="block text-[12px] text-muted">ainda não distribuída</span>}</span>,
            <span key="c" className="text-credit">{numero(u.classificados)}</span>,
            <span key="p" className={u.pendentes ? "text-debit" : ""}>{numero(u.pendentes)}</span>,
            <strong key="t">{numero(u.total)}</strong>,
            u.pct === null ? "—" : (
              <span key="pc" className="inline-flex items-center gap-2">
                <span className="w-16 h-1.5 rounded-full bg-line overflow-hidden"><span className="block h-full bg-credit" style={{ width: u.pct + "%" }} /></span>
                {u.pct.toFixed(1).replace(".", ",")}%
              </span>)
          ] }))} />
        <Tabela titulo="Bancos e movimentos" colunas={["Conta", "Classificados", "Pendentes", "Total"]} aoAbrir={navegar}
          vazio="Nenhuma conta cadastrada."
          linhas={p.bancos.map((b) => ({ chave: b.id, para: "/conta/" + b.id, celulas: [
            <span key="n">{b.nome}{b.semConta && <span className="block text-[12px] text-debit">sem conta contábil</span>}</span>,
            <span key="c" className="text-credit">{numero(b.classificados)}</span>,
            <span key="p" className={b.pendentes ? "text-debit" : ""}>{numero(b.pendentes)}</span>,
            <strong key="t">{numero(b.total)}</strong>
          ] }))} />
      </div>

      {/* dados */}
      <section className="cartao p-4 sm:p-5">
        <h2 className="text-[15px] font-semibold">Dados deste navegador</h2>
        <p className="text-[13px] text-muted mb-3">Enquanto o servidor não está ligado, os dados ficam só neste computador. Baixe o backup com frequência.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-contorno btn-sm" onClick={baixarBackup}>Baixar backup</button>
          <BotaoArquivo className="btn-contorno btn-sm" aceita=".json,application/json" aoEscolher={restaurar}>Restaurar backup</BotaoArquivo>
          <span className="w-px bg-line mx-1" aria-hidden="true" />
          <button type="button" className="btn-perigo btn-sm" onClick={zerar}>Zerar {p.nomeMes.toLowerCase()}</button>
          <button type="button" className="btn-perigo btn-sm" onClick={excluirUnidades}>Excluir unidades</button>
          <button type="button" className="btn-perigo btn-sm" onClick={() => setJanela("apagar")}>Apagar tudo</button>
        </div>
      </section>

      <ImportarPlanilha aberta={janela === "planilha"} aoFechar={() => setJanela("")} aoConcluir={(r) => setMsg({ texto: r.msg, tipo: r.aviso ? "aviso" : "info" })} />
      <ImportarExtratos aberta={janela === "extratos"} aoFechar={() => setJanela("")}
        aoConcluir={(r) => { if (r.contas.length === 1) { aviso(r.msg); navegar("/conta/" + r.contas[0]); } else setMsg({ texto: r.msg, tipo: "info" }); }} />
      <NovaConta aberta={janela === "conta"} aoFechar={() => setJanela("")} aoCriar={(c) => { aviso("Conta criada."); navegar("/conta/" + c.id); }} />
      {janela === "apagar" && <ApagarTudo aoFechar={() => setJanela("")} />}
    </div>
  );
}
