import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Core, Importacao } from "../lib/legado.js";
import { nomeDaFonte } from "../lib/contabil.mjs";
import { useContabil } from "../lib/useContabil.js";
import { baixarArquivos, lerPlanilha } from "../lib/leitores.js";
import { useAvisos } from "../componentes/Avisos.jsx";
import Janela from "../componentes/Janela.jsx";
import Icone from "../componentes/Icone.jsx";
import FormLancamento from "../componentes/contabil/FormLancamento.jsx";
import ImportarExtratos from "../componentes/contabil/ImportarExtratos.jsx";
import { BotaoArquivo, Campo, Mensagem, Numero, Saldo, Segmentado, Selo, Valor, dataBR, formatarValor, numero } from "../componentes/contabil/ui.jsx";

/*
 * Uma conta da Integração contábil: conta bancária, outra movimentação (Pagamentos em dinheiro, Juros…)
 * ou unidade (gerada pela distribuição, só leitura). Lançamentos do mês escolhido no topo.
 */
const POR_PAGINA = 300;

function ContaContabil({ conta, aoFechar }) {
  const [svc] = useContabil();
  const { aviso } = useAvisos();
  const [v, setV] = useState(conta.contaContabil || "");
  const [erro, setErro] = useState("");
  const salvar = () => {
    try { svc.definirContaContabil(conta.id, v); aviso("Conta contábil atualizada."); aoFechar(); } catch (e) { setErro(e.message); }
  };
  return (
    <Janela aberta titulo="Conta contábil no Único" aoFechar={aoFechar}
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button><button type="button" className="btn-primario" onClick={salvar}>Salvar</button></>}>
      <Campo rotulo={nomeDaFonte(conta)} id="cc-valor" dica={conta.tipo === "mov" ? "A Tabela de bancos da planilha lista o Caixa com a conta 5. Sem conta aqui, o sistema usa a do Caixa." : "Só números, como no plano de contas do Único (ex.: 643)."}>
        <input id="cc-valor" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") salvar(); }} />
      </Campo>
      {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
    </Janela>
  );
}

export default function Conta() {
  const { id } = useParams();
  const [svc, versao] = useContabil();
  const { aviso, confirmar } = useAvisos();
  const navegar = useNavigate();
  const conta = useMemo(() => svc.item(id), [svc, id, versao]);   // eslint-disable-line
  const lista = useMemo(() => (conta ? svc.lancamentos(id).slice().sort((a, b) => (conta.tipo === "unidade" ? 0 : (a.data || "").localeCompare(b.data || ""))) : []), [svc, id, conta, versao]);   // eslint-disable-line
  const tot = useMemo(() => svc.totais(lista), [svc, lista]);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [limite, setLimite] = useState(POR_PAGINA);
  const [form, setForm] = useState({ aberta: false, editando: null });
  const [janela, setJanela] = useState("");   // "contabil" | "extratos"
  const [msg, setMsg] = useState({ texto: "", tipo: "info" });
  const [lendo, setLendo] = useState(false);

  const visiveis = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return lista.filter((e) => {
      if (filtro === "pendentes" && e.categoria) return false;
      if (filtro === "sugeridas" && !e.sugerido) return false;
      if (!b) return true;
      return [e.desc, e.nome, e.doc, e.cpf, e.categoria, e.unidade, e.natureza, formatarValor(e.valorNum)].some((x) => String(x || "").toLowerCase().indexOf(b) > -1);
    });
  }, [lista, busca, filtro]);

  if (!conta || conta.tipo === "cadastro") {
    return <div className="cartao p-8 text-center"><p className="text-muted">Esta conta não existe mais.</p><Link to="/integracao" className="btn-contorno mt-4">Voltar para a Integração contábil</Link></div>;
  }
  const unidade = conta.tipo === "unidade";
  const temContabil = conta.tipo === "banco" || conta.entraNaIntegracao;
  const mes = svc.competencia();

  const importarAba = async (file) => {
    setLendo(true); setMsg({ texto: "Lendo " + file.name + "…", tipo: "info" });
    try {
      const lido = svc.lerAba(id, await lerPlanilha(file));
      if (lido.erro) { setMsg({ texto: lido.erro, tipo: "aviso" }); return; }
      let somar = true;
      if (lido.jaTem) {
        const r = await confirmar({ titulo: "Somar ou substituir?", botao: "Somar", alternativa: "Substituir",
          texto: "Encontrei " + numero(lido.itens.length) + " lançamento(s) na aba \"" + lido.aba + "\" (" + lido.meses.map((m) => Importacao.nomeCompetencia(m)).join(", ") + ").\n\nJá existem " + numero(lido.jaTem) +
            " nesse(s) mês(es).\nSomar: junta aos que já estão.\nSubstituir: fica só o que está na planilha, nesses meses." });
        if (!r) { setMsg({ texto: "Nada foi importado.", tipo: "info" }); return; }
        somar = r === true;
      }
      setMsg({ texto: svc.gravarAba(id, lido, somar), tipo: "info" });
    } catch (e) { setMsg({ texto: "Não consegui ler a planilha: " + (e.message || e), tipo: "erro" }); }
    finally { setLendo(false); }
  };
  const excluir = (e) => {
    const desfazer = svc.excluirLancamento(id, e.id);
    if (desfazer) aviso("Lançamento excluído.", { desfazer });
  };
  const apagarMes = async () => {
    if (!lista.length) return;
    if (!(await confirmar({ titulo: "Apagar os lançamentos do mês?", perigo: true, botao: "Apagar " + numero(lista.length),
      texto: "Os " + numero(lista.length) + " lançamentos de " + nomeDaFonte(conta) + " em " + svc.listaCompetencias().find((m) => m.mes === mes).nome + " serão apagados deste navegador. Os outros meses continuam." }))) return;
    svc.apagarDoMes(id); aviso("Lançamentos do mês apagados.");
  };
  const excluirConta = async () => {
    if (unidade) {
      if (!(await confirmar({ titulo: "Excluir a unidade " + conta.label + "?", perigo: true, botao: "Excluir unidade",
        texto: "Os lançamentos das contas bancárias não são apagados. Se ainda houver lançamentos classificados com essa unidade, ela volta ao distribuir de novo." }))) return;
      svc.excluirUnidade(id); aviso("Unidade excluída."); navegar("/integracao"); return;
    }
    if (!(await confirmar({ titulo: "Excluir a conta?", perigo: true, botao: "Excluir conta e lançamentos",
      texto: "A conta \"" + nomeDaFonte(conta) + "\" e os lançamentos dela em todos os meses serão apagados. Não dá para desfazer." }))) return;
    svc.excluirConta(id); aviso("Conta excluída."); navegar("/integracao");
  };
  const exportar = (tipo) => {
    if (!lista.length) { aviso("Nada para exportar nesta conta."); return; }
    if (tipo === "csv") {
      baixarArquivos([{ nome: nomeDaFonte(conta).replace(/[\\/:*?"<>|]/g, "_") + " " + mes + ".csv", conteudo: Core.toCSV(lista, conta.hasDataMov), tipo: "text/csv;charset=utf-8" }]);
    } else {
      navigator.clipboard.writeText(Core.toTSV(lista, conta.hasDataMov)).then(
        () => aviso(numero(lista.length) + " lançamento(s) copiados. Cole no Excel."), () => aviso("O navegador bloqueou a cópia."));
    }
  };
  const redistribuir = () => {
    const r = svc.distribuir();
    setMsg(r ? { texto: r.msg, tipo: r.semConta ? "aviso" : "info" } : { texto: "Nenhum lançamento classificado nas contas bancárias.", tipo: "aviso" });
  };

  return (
    <div className="space-y-4 max-w-[1400px]">
      {/* ações da conta */}
      <div className="flex flex-wrap items-center gap-2">
        {conta.tipo === "banco" && <span className="text-[13px] text-muted mr-1">{conta.bank}{conta.agencia ? " · ag. " + conta.agencia : ""}</span>}
        {temContabil && (
          <button type="button" className={conta.contaContabil ? "btn-contorno btn-sm" : "btn btn-sm bg-debit-soft text-debit border-debit/30"} onClick={() => setJanela("contabil")}>
            {conta.contaContabil ? "Conta contábil " + conta.contaContabil : "Definir conta contábil"}
          </button>
        )}
        <div className="flex-1" />
        {!unidade && <button type="button" className="btn-primario btn-sm" onClick={() => setForm({ aberta: true, editando: null })}><Icone nome="mais" />Novo lançamento</button>}
        {conta.tipo === "banco" && <button type="button" className="btn-contorno btn-sm" onClick={() => setJanela("extratos")}>Importar extrato</button>}
        {!unidade && <BotaoArquivo className="btn-contorno btn-sm" aceita=".xlsx,.xlsm,.xls" aoEscolher={importarAba} disabled={lendo}>Importar aba da planilha</BotaoArquivo>}
        {unidade && <button type="button" className="btn-contorno btn-sm" onClick={redistribuir}>Distribuir de novo</button>}
        <button type="button" className="btn-fantasma btn-sm" onClick={() => exportar("csv")}>Baixar CSV</button>
        <button type="button" className="btn-fantasma btn-sm" onClick={() => exportar("copiar")}>Copiar para o Excel</button>
      </div>

      {unidade && <Mensagem texto="Esta aba é montada pelo sistema a partir das contas bancárias, com as contas de débito e crédito. Para mudar algo, corrija o lançamento na conta bancária e distribua de novo." />}
      <Mensagem texto={msg.texto} tipo={msg.tipo} aoFechar={() => setMsg({ texto: "" })} />

      {/* totais */}
      <div className="cartao px-4 py-3 grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Numero rotulo="Lançamentos">{numero(tot.qtd)}</Numero>
        {!unidade && <Numero rotulo="Pendentes"><span className={tot.pendentes ? "text-debit" : "text-credit"}>{numero(tot.pendentes)}</span></Numero>}
        <Numero rotulo="Créditos"><Valor valor={tot.creditos} sinal="C" /></Numero>
        <Numero rotulo="Débitos"><Valor valor={tot.debitos} sinal="D" /></Numero>
        <Numero rotulo="Saldo"><Saldo valor={tot.saldo} /></Numero>
      </div>

      {/* filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={busca} onChange={(e) => { setBusca(e.target.value); setLimite(POR_PAGINA); }} placeholder="Buscar descrição, nome, documento, valor…" aria-label="Buscar nos lançamentos" className="max-w-[340px] h-9" />
        {!unidade && <Segmentado pequeno rotulo="Mostrar" valor={filtro} aoMudar={(v) => { setFiltro(v); setLimite(POR_PAGINA); }}
          opcoes={[["todos", "Todos"], ["pendentes", "Pendentes" + (tot.pendentes ? " (" + numero(tot.pendentes) + ")" : "")], ["sugeridas", "Sugeridas" + (tot.sugeridos ? " (" + numero(tot.sugeridos) + ")" : "")]]} />}
        <div className="flex-1" />
        {!unidade && tot.sugeridos > 0 && (
          <button type="button" className="btn-contorno btn-sm" title="Classificações sugeridas pelo histórico: confira antes"
            onClick={() => { const n = svc.confirmarSugestoes(id); aviso(n + " classificação(ões) confirmada(s)."); }}>Confirmar {numero(tot.sugeridos)} sugestão(ões)</button>
        )}
      </div>

      {/* tabela */}
      <div className="cartao overflow-hidden">
        {lista.length === 0 ? (
          <div className="p-10 text-center">
            <strong className="block text-[15px]">{unidade ? "Nada distribuído para esta unidade" : "Nenhum lançamento nesta conta neste mês"}</strong>
            <span className="text-muted text-[13.5px]">{unidade ? "Classifique os lançamentos nas contas bancárias e use Distribuir por unidade na Integração contábil."
              : "Adicione em Novo lançamento, importe o extrato do banco ou a aba da planilha. Confira também o mês escolhido no topo."}</span>
          </div>
        ) : visiveis.length === 0 ? (
          <p className="p-8 text-center text-muted">Nenhum lançamento com esse filtro.</p>
        ) : (
          <div className="overflow-x-auto relative">
            <table className="w-full text-[13.5px]">
              <thead className="bg-surface-2 text-left text-[12px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Data</th>
                  {conta.hasDataMov && <th className="px-3 py-2.5 font-semibold">Data mov.</th>}
                  {unidade && <th className="px-3 py-2.5 font-semibold">Banco</th>}
                  <th className="px-3 py-2.5 font-semibold">Descrição / fornecedor</th>
                  <th className="px-3 py-2.5 font-semibold">Doc.</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Valor</th>
                  <th className="px-3 py-2.5 font-semibold">Categoria</th>
                  {!unidade && <th className="px-3 py-2.5 font-semibold">Unidade</th>}
                  <th className="px-3 py-2.5 font-semibold">Natureza</th>
                  {unidade && <th className="px-3 py-2.5 font-semibold">Débito / crédito</th>}
                  {unidade && <th className="px-3 py-2.5 font-semibold">HP</th>}
                  {!unidade && <th className="px-3 py-2.5"><span className="sr-only">Ações</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visiveis.slice(0, limite).map((e) => {
                  const pendente = !e.categoria;
                  const sub = [e.nome, e.cpf].filter(Boolean).join(", ");
                  return (
                    <tr key={e.id} className={"align-top hover:bg-surface-2 " + (pendente && !unidade ? "bg-warn-soft/40" : "")}>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{dataBR(e.data)}</td>
                      {conta.hasDataMov && <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted">{dataBR(e.dataMov)}</td>}
                      {unidade && <td className="px-3 py-2 text-[12.5px] text-muted max-w-[160px]">{e.banco}</td>}
                      <td className="px-3 py-2 min-w-[220px] max-w-[420px]">
                        <span className="block">{e.desc || e.nome}</span>
                        {sub && sub !== e.desc && <span className="block text-[12px] text-muted">{sub}</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{e.doc}{e.modelo && <span className="block text-[12px] text-muted">{e.modelo}</span>}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {e.valorInvalido ? <Selo tipo="erro" title="Valor digitado fora do padrão. Corrija para não ir errado ao Único.">{e.valorOriginal || "inválido"}</Selo> : <Valor valor={e.valorNum} sinal={e.sign} />}
                        {e.bloqueado && <span className="block text-[12px] text-muted">bloqueado</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {pendente ? <Selo tipo="pendente">Pendente</Selo> : e.categoria}
                        {e.sugerido && <> <Selo tipo="sugerida" title="Classificação sugerida pelo histórico: confira e confirme">sugerida</Selo></>}
                      </td>
                      {!unidade && <td className="px-3 py-2 whitespace-nowrap">{e.unidade}</td>}
                      <td className="px-3 py-2 text-[13px]">{e.natureza}{e.conta && !unidade && <span className="block text-[12px] text-muted">conta {e.conta}</span>}</td>
                      {unidade && (
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums">{e.ctaDeb || "—"} / {e.ctaCred || "—"}
                          {(!e.ctaDeb || !e.ctaCred) && <> <Selo tipo="erro" title="Sem conta contábil: confira a categoria e a conta do banco">faltando</Selo></>}</td>
                      )}
                      {unidade && <td className="px-3 py-2 tabular-nums">{e.hp}</td>}
                      {!unidade && (
                        <td className="px-2 py-1.5 whitespace-nowrap text-right">
                          <button type="button" className="btn-fantasma btn-sm" onClick={() => setForm({ aberta: true, editando: e })}>Editar</button>
                          <button type="button" className="btn-perigo btn-sm" onClick={() => excluir(e)}>Excluir</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {visiveis.length > limite && (
          <div className="border-t border-line p-3 text-center text-[13px] text-muted">
            Mostrando {numero(limite)} de {numero(visiveis.length)}.{" "}
            <button type="button" className="btn-contorno btn-sm ml-2" onClick={() => setLimite((l) => l + POR_PAGINA)}>Mostrar mais {numero(Math.min(POR_PAGINA, visiveis.length - limite))}</button>
          </div>
        )}
      </div>

      {/* zona de cuidado */}
      <div className="flex flex-wrap gap-2 pt-2">
        {!unidade && lista.length > 0 && <button type="button" className="btn-perigo btn-sm" onClick={apagarMes}>Apagar os lançamentos deste mês</button>}
        {(conta.tipo === "banco" || unidade) && <button type="button" className="btn-perigo btn-sm" onClick={excluirConta}>{unidade ? "Excluir unidade" : "Excluir conta"}</button>}
      </div>

      <FormLancamento aberta={form.aberta} conta={conta} editando={form.editando} aoFechar={() => setForm({ aberta: false, editando: null })} />
      {janela === "contabil" && <ContaContabil conta={conta} aoFechar={() => setJanela("")} />}
      <ImportarExtratos aberta={janela === "extratos"} contaFixa={id} aoFechar={() => setJanela("")}
        aoConcluir={(r) => setMsg({ texto: r.msg, tipo: "info" })} />
    </div>
  );
}
