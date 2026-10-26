import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Conciliacao as RegrasConc, Core, Extratos, Store } from "../lib/legado.js";
import { nomeDaFonte } from "../lib/contabil.mjs";
import { calcular, gruposConferidos, gruposDaConta, grupoManual, mesesDoExtrato, prepararExtrato, salvarGruposDaConta } from "../lib/conciliar.mjs";
import { useContabil } from "../lib/useContabil.js";
import { baixarArquivos, lerArquivoExtrato } from "../lib/leitores.js";
import { useAvisos } from "../componentes/Avisos.jsx";
import { BotaoArquivo, Campo, Mensagem, Segmentado } from "../componentes/contabil/ui.jsx";
import { BarraSelecao, JanelaObs, Resumo, Tabela } from "../componentes/conciliacao/Resultado.jsx";
import ConciliacaoAvulsa from "../componentes/conciliacao/Avulsa.jsx";

/*
 * Conciliação. Por conta: o extrato do banco contra os lançamentos da conta no sistema, pelo valor,
 * pelo sinal (C/D) e pela data (com tolerância). O que a regra não casa sozinha a pessoa junta à mão
 * ou marca como conferido; isso fica guardado por conta e vale nas próximas vezes.
 * Extrato × planilha (avulsa): componentes/conciliacao/Avulsa.jsx.
 */
const POR_PAGINA = 400;
// o extrato lido fica na memória enquanto o sistema está aberto: sair da tela e voltar não perde nada
const memoria = { contaId: "", lido: null, tolerancia: 3, modo: "conta" };

function ConciliacaoPorConta() {
  const [svc, versao] = useContabil();
  const { aviso, confirmar } = useAvisos();
  const contas = useMemo(() => svc.bancos().concat(svc.movimentos()), [svc, versao]);   // eslint-disable-line
  const [contaId, setContaIdEstado] = useState(memoria.contaId);
  const [lido, setLidoEstado] = useState(memoria.lido);
  const [tolerancia, setTolEstado] = useState(memoria.tolerancia);
  const [filtro, setFiltro] = useState("");
  const [msg, setMsg] = useState({ texto: "", tipo: "info" });
  const [selecao, setSelecao] = useState({ ext: {}, sis: {} });
  const [pedido, setPedido] = useState(null);
  const [limite, setLimite] = useState(POR_PAGINA);
  const [rev, setRev] = useState(0);   // grupos manuais mudaram
  const setContaId = (v) => { memoria.contaId = v; setContaIdEstado(v); setSelecao({ ext: {}, sis: {} }); };
  const setLido = (v) => { memoria.lido = v; setLidoEstado(v); setSelecao({ ext: {}, sis: {} }); setLimite(POR_PAGINA); };
  const setTol = (v) => { memoria.tolerancia = v; setTolEstado(v); };

  const grupos = useMemo(() => gruposDaConta(Store, contaId), [contaId, rev, versao]);   // eslint-disable-line
  const sistema = useMemo(() => {   // lançamentos da conta em todos os meses que o extrato cobre (não só o mês do topo)
    if (!lido || !contaId) return [];
    return mesesDoExtrato(lido.itens).reduce((l, m) => l.concat(svc.lancamentos(contaId, m)), []);
  }, [svc, lido, contaId, versao]);   // eslint-disable-line
  const r = useMemo(() => (lido && contaId ? calcular({ Core, Conciliacao: RegrasConc, extrato: lido.itens, sistema, grupos, tolerancia, filtro, avulso: false }) : null),
    [lido, contaId, sistema, grupos, tolerancia, filtro]);

  const ler = async (file) => {
    setMsg({ texto: "Lendo " + file.name + "…", tipo: "info" });
    const l = await lerArquivoExtrato(file);
    if (l.erro) { setMsg({ texto: l.erro, tipo: "erro" }); return; }
    if (!l.itens.length) { setMsg({ texto: "Nenhuma movimentação reconhecida no arquivo.", tipo: "aviso" }); return; }
    const cand = Extratos.contasCandidatas(l.numeroConta, svc.bancos());
    let conta = contaId;
    if (!conta && cand.length === 1) { conta = cand[0].id; setContaId(conta); }
    const avisos = [];
    if (!conta) avisos.push((l.numeroConta ? "O extrato é da conta " + l.numeroConta + ", que não está cadastrada" + (cand.length > 1 ? " de forma única" : "") + ". " : "") + "Escolha a conta na lista.");
    else if (l.numeroConta && cand.length && !cand.some((c) => c.id === conta)) avisos.push("Atenção: o extrato é da conta " + l.numeroConta + ", e a conta escolhida é outra.");
    const conf = l.conferencia && l.conferencia.total
      ? (l.conferencia.conferidos === l.conferencia.total ? " Saldos do extrato conferidos em " + l.conferencia.total + " dia(s)." : " Atenção: o saldo do extrato não fecha em " + (l.conferencia.total - l.conferencia.conferidos) + " dia(s).")
      : "";
    setLido({ itens: prepararExtrato(l.itens, file.name), arquivo: file.name, formato: l.formato, numeroConta: l.numeroConta });
    setMsg({ texto: l.itens.length + " movimentação(ões) lidas (" + l.formato + (l.numeroConta ? ", conta " + l.numeroConta : "") + ")." + conf + (avisos.length ? " " + avisos.join(" ") : ""), tipo: avisos.length ? "aviso" : "info" });
  };
  const gravarGrupos = (g) => { salvarGruposDaConta(Store, contaId, g); setRev((x) => x + 1); setSelecao({ ext: {}, sis: {} }); };
  const alternar = (lado, chave) => setSelecao((s) => {
    const n = { ext: Object.assign({}, s.ext), sis: Object.assign({}, s.sis) };
    if (n[lado][chave]) delete n[lado][chave]; else n[lado][chave] = true;
    return n;
  });
  // a seleção só vale para o que ainda está pendente na tela
  const vivos = useMemo(() => {
    const v = { ext: [], sis: [] };
    if (r) r.linhas.forEach((l) => { if (l.lado && selecao[l.lado][l.chave]) v[l.lado].push(l.chave); });
    return v;
  }, [r, selecao]);
  const juntar = (dif) => {
    const fazer = (obs) => { gravarGrupos(grupos.concat(grupoManual(vivos.ext, vivos.sis, obs))); setPedido(null); aviso("Conciliado à mão.", { desfazer: () => gravarGrupos(grupos) }); };
    if (dif === 0) { fazer(""); return; }
    setPedido({ titulo: "Os valores não batem", botao: "Conciliar assim", rotulo: "Motivo", exemplo: "juros, desconto, tarifa embutida…",
      texto: "A diferença é de " + Core.formatBR(dif / 100) + ". Se estiver certo, escreva o motivo e confirme.", ok: fazer });
  };
  const conferir = () => {
    const n = vivos.ext.length + vivos.sis.length;
    setPedido({ titulo: "Marcar como conferido", botao: "Marcar " + n + " item(ns)", rotulo: "Observação (opcional)", exemplo: "tarifa bancária, transferência entre contas…",
      texto: n + " item(ns) ficam como conferidos, sem par. Dá para desfazer depois.",
      ok: (obs) => { gravarGrupos(grupos.concat(gruposConferidos(vivos.ext, vivos.sis, obs))); setPedido(null); aviso("Marcado como conferido.", { desfazer: () => gravarGrupos(grupos) }); } });
  };
  const desfazer = (idx) => { const g = grupos.slice(); g.splice(idx, 1); gravarGrupos(g); aviso("Desfeito: os itens voltaram para a conciliação.", { desfazer: () => gravarGrupos(grupos) }); };
  const exportar = () => {
    if (!r) return;
    baixarArquivos([{ nome: "conciliacao-" + new Date().toISOString().slice(0, 10) + ".csv", conteudo: RegrasConc.csvResultado(r.linhas, "Sistema"), tipo: "text/csv;charset=utf-8" }]);
  };
  const limpar = async () => {
    if (!(await confirmar({ titulo: "Limpar a conciliação?", botao: "Limpar", texto: "O extrato sai da tela. O que foi conciliado à mão continua guardado para esta conta." }))) return;
    setLido(null); setFiltro(""); setMsg({ texto: "" });
  };

  const meses = lido ? mesesDoExtrato(lido.itens) : [];
  const conta = contas.find((c) => c.id === contaId);
  return (
    <div className="space-y-4">
      <section className="cartao p-4 sm:p-5 space-y-4">
        <p className="text-[13.5px] text-muted max-w-[760px]">Aceita PDF, OFX, TXT do Sicoob, CSV e planilha. Cada movimentação do banco é cruzada com os lançamentos da conta pelo valor, pelo sinal (C/D) e pela data. Sem conta escolhida, ela é reconhecida pelo número do extrato.</p>
        <div className="grid sm:grid-cols-[minmax(0,1fr)_auto_140px] gap-3 items-end">
          <Campo rotulo="Conta" id="conc-conta">
            <select id="conc-conta" value={contaId} onChange={(e) => setContaId(e.target.value)}>
              <option value="">Escolha uma conta…</option>
              {contas.map((c) => <option key={c.id} value={c.id}>{c.bank === "Movimento" ? c.label : nomeDaFonte(c)}</option>)}
            </select>
          </Campo>
          <BotaoArquivo className="btn-primario h-10" aceita=".pdf,.ofx,.txt,.csv,.xlsx,.xlsm,.xls" aoEscolher={ler}>{lido ? "Trocar o extrato" : "Escolher o extrato"}</BotaoArquivo>
          <Campo rotulo="Tolerância de data" id="conc-tol">
            <div className="flex items-center gap-2"><input id="conc-tol" type="number" min="0" max="15" value={tolerancia} onChange={(e) => setTol(e.target.value)} className="w-20" /><span className="text-[13px] text-muted">dias</span></div>
          </Campo>
        </div>
        {!contas.length && <p className="text-[13px] text-warn">Nenhuma conta cadastrada. Cadastre em <Link to="/integracao" className="underline font-semibold">Integração contábil</Link>.</p>}
        {lido && <p className="text-[13px] text-muted">Extrato: <strong className="text-ink-2">{lido.arquivo}</strong>{meses.length ? " · " + meses.map((m) => m.slice(5) + "/" + m.slice(0, 4)).join(", ") : ""}
          {conta && !sistema.length && <span className="text-warn"> · a conta não tem lançamentos nesse período: importe o extrato ou a planilha na Integração contábil primeiro.</span>}</p>}
      </section>
      <Mensagem texto={msg.texto} tipo={msg.tipo} aoFechar={() => setMsg({ texto: "" })} />

      {r && (<>
        <Resumo r={r} />
        <div className="flex flex-wrap items-center gap-2">
          <input type="search" value={filtro} onChange={(e) => { setFiltro(e.target.value); setLimite(POR_PAGINA); }} placeholder="Buscar descrição, nome, documento…" aria-label="Buscar na conciliação" className="max-w-[340px] h-9" />
          <div className="flex-1" />
          <button type="button" className="btn-contorno btn-sm" onClick={exportar}>Baixar resultado (CSV)</button>
          <button type="button" className="btn-fantasma btn-sm" onClick={limpar}>Limpar</button>
        </div>
        <Tabela r={r} selecao={selecao} alternar={alternar} desfazer={desfazer} limite={limite} mostrarMais={() => setLimite((x) => x + POR_PAGINA)}
          descSistema={(s) => <><span className="block">{s.desc}</span>{(s.categoria || s.nome) && <span className="block text-[12px] text-muted">{[s.nome, s.categoria].filter(Boolean).join(" · ")}</span>}</>} />
        <BarraSelecao itensExt={vivos.ext.map((k) => r.itemDe("ext", k))} itensSis={vivos.sis.map((k) => r.itemDe("sis", k))}
          aoJuntar={juntar} aoConferir={conferir} aoCancelar={() => setSelecao({ ext: {}, sis: {} })} />
      </>)}
      <JanelaObs pedido={pedido} aoFechar={() => setPedido(null)} />
    </div>
  );
}

export default function Conciliacao() {
  const [modo, setModo] = useState(memoria.modo);
  return (
    <div className="space-y-4 max-w-[1400px]">
      <div className="max-w-[460px]">
        <Segmentado rotulo="Tipo de conciliação" valor={modo} aoMudar={(m) => { memoria.modo = m; setModo(m); }}
          opcoes={[["conta", "Conta do sistema"], ["avulsa", "Extrato × planilha"]]} />
      </div>
      {modo === "conta" ? <ConciliacaoPorConta /> : <ConciliacaoAvulsa />}
    </div>
  );
}
