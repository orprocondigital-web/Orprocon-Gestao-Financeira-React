import { useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORIAS, aprender, bancoDoExtrato, conferirBalancete, lerBalancetePdf, lerComprovante, linhasDoExtrato, listasDaV5,
  mesDoEstado, mesVazio, montarMes, pedidoDoMes, trechoParaRegra, txtUnicoFan
} from "../lib/fan/regrasFan.mjs";
import { fan, useFan } from "../lib/fan/useFan.js";
import {
  CONCILIACAO_NO_SERVIDOR as SRV, abrirConciliacao, criarConciliacao, listarConciliacoes, salvarConciliacao
} from "../lib/conciliacaoServidor.js";
import { baixarArquivos, lerArquivoExtrato, lerPlanilha, textoDoPdf } from "../lib/leitores.js";
import { useAvisos } from "../componentes/Avisos.jsx";
import Janela from "../componentes/Janela.jsx";
import { BotaoArquivo, Campo, Mensagem, Numero, Segmentado, Selo, Valor, dataBR, formatarValor, numero } from "../componentes/contabil/ui.jsx";

/*
 * Fam Metal · Conciliação bancária (/fan/conciliacao): o trabalho da planilha FAM_Reconciliacao v5 dentro do sistema.
 *   Mês: os extratos de todos os bancos (e os comprovantes) → cada linha com categoria, participante e contas, pelas
 *        regras da v5 (src/lib/fan/regrasFan.mjs); o que sobra a pessoa decide na linha ou vira regra; gera o TXT do Único.
 *   Conferência: o balancete de fornecedores do Único × o que foi pago no mês.
 *   Cadastros: contas, bancos, contratos de empréstimo, listas de fornecedores e funcionários (importa da v5) e regras.
 * O mês fica salvo no servidor (uma conciliação do tipo "fan" por competência), com versão: duas pessoas não se
 * sobrescrevem. Sem servidor, fica neste navegador.
 */
const POR_PAGINA = 300;
const ESPERA_SALVAR = 2500;
const ROTULO = { "Transferencia Bancaria": "Transferência", "Conciliacao Manual": "Conta fixa", Consorcio: "Consórcio", Emprestimo: "Empréstimo" };
const rotulo = (c) => ROTULO[c] || c || "—";
function mesAnterior() { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
const lerLocal = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
const gravarLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const chaveLocal = (comp) => "gf.fan.mes." + comp;   // sem servidor (não sobe pelos módulos: o mês vai em /api/conciliacoes)
const hora = (iso) => { try { return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };

// o mês aberto fica na memória enquanto o sistema está aberto: sair da tela e voltar não perde nada
const memoria = { mes: null, servidor: null, aba: "mes" };

export default function FanMetal() {
  const [cfg] = useFan();
  const { aviso, confirmar } = useAvisos();
  const [aba, setAbaEstado] = useState(memoria.aba);
  const setAba = (a) => { memoria.aba = a; setAbaEstado(a); };
  const [mes, setMesEstado] = useState(memoria.mes);
  const [servidor, setServidorEstado] = useState(memoria.servidor);   // { id, versao, atualizadoEm, por }
  const [sujo, setSujo] = useState(false);
  const [situacao, setSituacao] = useState({ tipo: "", texto: "" });
  const [lista, setLista] = useState([]);
  const [msg, setMsg] = useState({ texto: "", tipo: "info" });
  const [competencia, setCompEstado] = useState(() => (memoria.mes && memoria.mes.competencia) || lerLocal("gf.fan.competencia") || mesAnterior());
  const setCompetencia = (c) => { gravarLocal("gf.fan.competencia", c); setCompEstado(c); };   // volta no mesmo mês depois de F5
  const mesRef = useRef(mes), srvRef = useRef(servidor), enviando = useRef(false);
  mesRef.current = mes; srvRef.current = servidor;

  const setMes = (m) => { memoria.mes = m; setMesEstado(m); };
  const setServidor = (s) => { memoria.servidor = s; setServidorEstado(s); };
  const mudarMes = (fn) => { const n = fn(mesRef.current); mesRef.current = n; setMes(n); setSujo(true); };

  const recarregarLista = () => (SRV ? listarConciliacoes().then((l) => setLista((l || []).filter((c) => c.tipo === "fan"))).catch(() => {}) : Promise.resolve());
  useEffect(() => { recarregarLista(); }, []);   // eslint-disable-line

  const abrirMes = async (comp) => {
    if (!/^\d{4}-\d{2}$/.test(comp || "")) return;
    setMsg({ texto: "" }); setSituacao({ tipo: "", texto: "" }); setSujo(false);
    if (!SRV) { setServidor(null); setMes(mesDoEstado(lerLocal(chaveLocal(comp)), comp)); return; }
    setSituacao({ tipo: "salvando", texto: "Abrindo…" });
    try {
      const l = (await listarConciliacoes({ competencia: comp })).filter((c) => c.tipo === "fan");
      if (!l.length) { setServidor(null); setMes(mesVazio(comp)); setSituacao({ tipo: "", texto: "" }); return; }
      const dto = await abrirConciliacao(l[0].id);
      setServidor({ id: dto.id, versao: dto.versao, atualizadoEm: dto.atualizadoEm, por: dto.atualizadoPorNome || dto.atualizadoPor || "" });
      setMes(mesDoEstado(dto.estado, comp));
      setSituacao({ tipo: "salvo", texto: "Aberto: salvo por " + (dto.atualizadoPorNome || dto.atualizadoPor || "alguém") + " às " + hora(dto.atualizadoEm) + "." });
    } catch (e) { setSituacao({ tipo: "erro", texto: "Não consegui abrir o mês: " + e.message }); }
  };
  useEffect(() => { if (!mes || mes.competencia !== competencia) abrirMes(competencia); }, [competencia]);   // eslint-disable-line

  const r = useMemo(() => (mes ? montarMes(mes.extratos, cfg, mes.decisoes, mes.comprovantes, mes.competencia) : null), [mes, cfg]);
  const rRef = useRef(r); rRef.current = r;

  // salvamento automático, um instante depois de cada mudança
  const enviar = async () => {
    const m = mesRef.current, s = srvRef.current;
    if (!m || enviando.current) return;
    if (!SRV) { if (!gravarLocal(chaveLocal(m.competencia), m)) setSituacao({ tipo: "erro", texto: "Não consegui guardar neste navegador (espaço cheio?)." }); else setSituacao({ tipo: "salvo", texto: "Guardado neste navegador." }); setSujo(false); return; }
    if (!s && !m.extratos.length) { setSujo(false); return; }   // mês vazio não vai para o servidor
    enviando.current = true;
    setSituacao({ tipo: "salvando", texto: "Salvando…" });
    try {
      const pedido = pedidoDoMes(m, fan.config(), rRef.current && rRef.current.resumo);
      const dto = s ? await salvarConciliacao(s.id, s.versao, pedido) : await criarConciliacao(pedido);
      setServidor({ id: dto.id, versao: dto.versao, atualizadoEm: dto.atualizadoEm, por: dto.atualizadoPorNome || "" });
      if (mesRef.current === m) setSujo(false);   // mudou enquanto subia: sobe de novo na próxima volta
      setSituacao({ tipo: "salvo", texto: "Salvo no servidor às " + hora(dto.atualizadoEm) + "." });
      setLista((l) => [dto].concat(l.filter((x) => x.id !== dto.id)));
    } catch (e) {
      setSituacao(e.codigo === "conflito" || e.status === 404 ? { tipo: "conflito", texto: e.message } : { tipo: "erro", texto: "Não consegui salvar no servidor: " + e.message });
    } finally { enviando.current = false; }
  };
  useEffect(() => {
    if (!sujo || situacao.tipo === "conflito" || situacao.tipo === "erro") return undefined;
    const t = setTimeout(enviar, ESPERA_SALVAR);
    return () => clearTimeout(t);
  }, [mes, sujo, situacao.tipo]);   // eslint-disable-line
  useEffect(() => {   // fechar a aba com mudança que não subiu: o navegador pergunta
    const f = (e) => { if (sujo) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [sujo]);

  const trocarMes = async (comp) => {
    if (comp === competencia) return;
    if (sujo && !(await confirmar({ titulo: "Trocar de mês?", botao: "Trocar", texto: "A última mudança ainda não foi salva e fica de fora." }))) return;
    setCompetencia(comp);
  };

  return (
    <div className="space-y-4 max-w-[1400px]">
      <section className="cartao p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <Campo rotulo="Mês" id="fan-mes">
            <input id="fan-mes" type="month" value={competencia} onChange={(e) => trocarMes(e.target.value)} className="w-[170px]" />
          </Campo>
          {SRV && lista.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pb-1" aria-label="Meses salvos">
              {lista.slice().sort((a, b) => String(b.competencia).localeCompare(String(a.competencia))).slice(0, 8).map((c) => (
                <button key={c.id} type="button" onClick={() => trocarMes(c.competencia)} title={"Salvo por " + (c.atualizadoPorNome || c.atualizadoPor || "") + " · " + c.ok + " OK, " + c.soExtrato + " a revisar"}
                  className={"rounded-full px-2.5 py-1 text-[12.5px] border " + (c.competencia === competencia ? "bg-brand-soft text-brand border-brand/30 font-semibold" : "border-line text-ink-2 hover:bg-surface-2")}>
                  {c.competencia ? c.competencia.slice(5) + "/" + c.competencia.slice(0, 4) : c.nome}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1" />
          <div className="pb-1"><Segmentado pequeno rotulo="Parte da conciliação" valor={aba} aoMudar={setAba}
            opcoes={[["mes", "Lançamentos do mês"], ["conferencia", "Conferência com o balancete"], ["cadastros", "Contas, listas e regras"]]} /></div>
        </div>
        {situacao.texto && (
          <div className={"flex flex-wrap items-center gap-2 text-[13px] " + (situacao.tipo === "conflito" || situacao.tipo === "erro" ? "text-warn" : "text-muted")} role="status">
            <span>{situacao.texto}{situacao.tipo === "conflito" ? " As suas últimas mudanças não foram para o servidor." : ""}</span>
            {situacao.tipo === "conflito" && <button type="button" className="btn-contorno btn-sm" onClick={() => abrirMes(competencia)}>Abrir a versão do servidor</button>}
            {situacao.tipo === "erro" && <button type="button" className="btn-contorno btn-sm" onClick={() => { setSituacao({ tipo: "", texto: "" }); enviar(); }}>Tentar de novo</button>}
          </div>
        )}
      </section>
      <Mensagem texto={msg.texto} tipo={msg.tipo} aoFechar={() => setMsg({ texto: "" })} />
      {aba === "cadastros" ? <Cadastros cfg={cfg} setMsg={setMsg} />
        : !mes ? <p className="text-muted">Abrindo o mês…</p>
          : aba === "conferencia" ? <Conferencia mes={mes} r={r} cfg={cfg} mudarMes={mudarMes} setMsg={setMsg} />
            : <Lancamentos mes={mes} r={r} cfg={cfg} mudarMes={mudarMes} setMsg={setMsg} aviso={aviso} confirmar={confirmar} />}
    </div>
  );
}

// ------------------------------------------------------------ lançamentos do mês

function Lancamentos({ mes, r, cfg, mudarMes, setMsg, aviso, confirmar }) {
  const [filtro, setFiltro] = useState({ status: "REVISAR", banco: "", categoria: "", busca: "" });
  const [limite, setLimite] = useState(POR_PAGINA);
  const [editando, setEditando] = useState(null);
  const nomesBanco = Object.fromEntries(cfg.bancos.map((b) => [b.id, b.nome]));

  const lerExtratos = async (files) => {
    setMsg({ texto: "Lendo " + files.length + " extrato(s)…", tipo: "info" });
    const lidos = await Promise.all(files.map(lerArquivoExtrato));
    const avisos = [], novos = [];
    lidos.forEach((l) => {
      if (l.erro) { avisos.push(l.arquivo + ": " + l.erro); return; }
      if (!l.itens.length) { avisos.push(l.arquivo + ": nenhuma movimentação reconhecida."); return; }
      const bancoId = bancoDoExtrato(l.numeroConta, l.arquivo, cfg);
      const linhas = linhasDoExtrato(l.itens, bancoId);
      const fora = linhas.filter((x) => x.data.slice(0, 7) !== mes.competencia).length;
      if (!bancoId) avisos.push(l.arquivo + ": não reconheci o banco" + (l.numeroConta ? " (conta " + l.numeroConta + ")" : "") + ". Escolha na lista.");
      if (fora) avisos.push(l.arquivo + ": " + fora + " movimentação(ões) fora de " + mes.competencia.slice(5) + "/" + mes.competencia.slice(0, 4) + " (ficam de fora do TXT).");
      novos.push({ id: l.arquivo, arquivo: l.arquivo, formato: l.formato, numeroConta: l.numeroConta || "", bancoId, linhas });
    });
    if (novos.length) mudarMes((m) => Object.assign({}, m, { extratos: m.extratos.filter((e) => !novos.some((n) => n.id === e.id)).concat(novos) }));
    const n = novos.reduce((t, e) => t + e.linhas.length, 0);
    setMsg({ texto: (novos.length ? novos.length + " extrato(s), " + numero(n) + " movimentação(ões). " : "") + avisos.join(" "), tipo: avisos.length ? "aviso" : "info" });
  };
  const trocarBanco = (id, bancoId) => mudarMes((m) => Object.assign({}, m, { extratos: m.extratos.map((e) => (e.id !== id ? e : Object.assign({}, e, {
    bancoId, linhas: e.linhas.map((l) => Object.assign({}, l, { bancoId, chave: bancoId + l.chave.slice(String(l.bancoId).length) }))
  }))) }));
  const tirarExtrato = async (e) => {
    if (!(await confirmar({ titulo: "Tirar este extrato?", botao: "Tirar", texto: e.arquivo + " sai do mês. O que foi decidido nas linhas dele fica guardado e volta se ele for importado de novo." }))) return;
    mudarMes((m) => Object.assign({}, m, { extratos: m.extratos.filter((x) => x.id !== e.id) }));
  };
  const lerComprovantes = async (files) => {
    setMsg({ texto: "Lendo " + files.length + " comprovante(s)…", tipo: "info" });
    const ruins = [], bons = [];
    for (const f of files) {
      try { const c = lerComprovante(await textoDoPdf(f), f.name); if (c) bons.push(c); else ruins.push(f.name); } catch (e) { ruins.push(f.name); }
    }
    mudarMes((m) => Object.assign({}, m, { comprovantes: m.comprovantes.filter((c) => !bons.some((b) => b.arquivo === c.arquivo)).concat(bons) }));
    setMsg({ texto: bons.length + " comprovante(s) lido(s)." + (ruins.length ? " Não achei data e valor em: " + ruins.join(", ") + "." : ""), tipo: ruins.length ? "aviso" : "info" });
  };

  const decidir = (linha, dec, regra) => {
    if (regra) {
      // a conta do banco da linha vira "banco": a regra vale para o extrato de qualquer banco
      const contaBanco = (cfg.bancos.find((b) => b.id === linha.bancoId) || {}).conta;
      const lado = (x) => (x && x === contaBanco ? "banco" : x || "");
      fan.gravar((c) => Object.assign({}, c, { regras: c.regras.concat({ contem: regra, categoria: dec.categoria, d: lado(dec.d), c: lado(dec.c), participante: dec.participante || "" }) }));
      mudarMes((m) => { const d = Object.assign({}, m.decisoes); delete d[linha.chave]; return Object.assign({}, m, { decisoes: d }); });
      aviso("Regra criada: todo histórico com \"" + regra + "\" vai para " + rotulo(dec.categoria) + ".");
    } else {
      mudarMes((m) => Object.assign({}, m, { decisoes: Object.assign({}, m.decisoes, { [linha.chave]: dec }) }));
    }
    if (dec.categoria === "Fornecedor" || dec.categoria === "Folha") fan.gravar((c) => aprender(c, dec));
    setEditando(null);
  };
  const voltarRegra = (linha) => {
    mudarMes((m) => { const d = Object.assign({}, m.decisoes); delete d[linha.chave]; return Object.assign({}, m, { decisoes: d }); });
    setEditando(null);
  };

  const gerarTxt = async () => {
    if (r.resumo.revisar && !(await confirmar({ titulo: "Ainda há linhas a revisar", botao: "Gerar assim",
      texto: numero(r.resumo.revisar) + " linha(s) ficam fora do TXT até serem decididas. Gerar só com as que estão OK?" }))) return;
    const t = txtUnicoFan(r.linhas);
    if (!t.exportadas) { setMsg({ texto: "Nenhuma linha pronta para o TXT.", tipo: "aviso" }); return; }
    baixarArquivos([{ nome: "Fam_" + mes.competencia + ".txt", conteudo: t.texto }]);
    setMsg({ texto: "TXT do Único: " + numero(t.exportadas) + " lançamento(s)." + (t.ignoradas ? " " + t.ignoradas + " sem conta ficaram de fora." : ""), tipo: "info" });
  };

  const visiveis = useMemo(() => {
    if (!r) return [];
    const b = filtro.busca.trim().toUpperCase();
    return r.linhas.filter((l) => (!filtro.status || (filtro.status === "REVISAR" ? l.status !== "OK" && !l.foraDoMes : l.status === filtro.status))
      && (!filtro.banco || l.bancoId === filtro.banco)
      && (!filtro.categoria || (filtro.categoria === "-" ? !l.categoria : l.categoria === filtro.categoria))
      && (!b || (l.texto + " " + (l.participante || "") + " " + (l.cnpj || "") + " " + formatarValor(l.valor)).toUpperCase().indexOf(b) > -1));
  }, [r, filtro]);
  const mudarFiltro = (k, v) => { setFiltro((f) => Object.assign({}, f, { [k]: v })); setLimite(POR_PAGINA); };
  const casados = r ? r.linhas.filter((l) => l.comprovante).length : 0;

  return (
    <div className="space-y-4">
      <section className="cartao p-4 sm:p-5 space-y-3">
        <p className="text-[13.5px] text-muted max-w-[820px]">Importe o extrato de cada banco do mês (OFX, planilha ou PDF). Cada movimentação recebe a categoria, o participante e as contas pelas regras da planilha da Fam (FAM_Reconciliacao v5). Os comprovantes de pagamento resolvem o fornecedor das linhas que o extrato não identifica.</p>
        <div className="flex flex-wrap gap-2">
          <BotaoArquivo multiplo className="btn-primario" aceita=".ofx,.xls,.xlsx,.pdf,.csv,.txt" aoEscolher={lerExtratos}>Importar extratos</BotaoArquivo>
          <BotaoArquivo multiplo aceita=".pdf" aoEscolher={lerComprovantes}>Importar comprovantes (PDF)</BotaoArquivo>
          <div className="flex-1" />
          {r && r.linhas.length > 0 && <button type="button" className="btn-primario" onClick={gerarTxt}>Gerar TXT do Único</button>}
        </div>
        {mes.extratos.length > 0 && (
          <ul className="divide-y divide-line border border-line rounded-lg">
            {mes.extratos.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-[13px]">
                <span className="flex-1 min-w-[200px] truncate" title={e.arquivo}><strong className="text-ink-2">{e.arquivo}</strong> <span className="text-muted">· {e.formato}{e.numeroConta ? " · conta " + e.numeroConta : ""} · {numero(e.linhas.length)} linhas</span></span>
                <select aria-label={"Banco do extrato " + e.arquivo} value={e.bancoId} onChange={(x) => trocarBanco(e.id, x.target.value)} className={"h-8 w-[170px] " + (e.bancoId ? "" : "border-warn")}>
                  <option value="">Qual banco?</option>
                  {cfg.bancos.map((b) => <option key={b.id} value={b.id}>{b.nome} ({b.conta})</option>)}
                </select>
                <button type="button" className="btn-fantasma btn-sm" onClick={() => tirarExtrato(e)}>Tirar</button>
              </li>
            ))}
          </ul>
        )}
        {mes.comprovantes.length > 0 && <p className="text-[13px] text-muted">{mes.comprovantes.length} comprovante(s), {casados} casado(s) com uma linha do extrato pela data e pelo valor.</p>}
      </section>

      {r && r.linhas.length > 0 && (<>
        <section className="cartao p-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          <Numero rotulo="Movimentações">{numero(r.resumo.total)}</Numero>
          <Numero rotulo="Prontas (OK)"><span className="text-credit">{numero(r.resumo.ok)}</span></Numero>
          <Numero rotulo="A revisar"><span className={r.resumo.revisar ? "text-warn" : ""}>{numero(r.resumo.revisar)}</span></Numero>
          {r.resumo.fora > 0 && <Numero rotulo="Fora do mês (não entram)"><span className="text-muted">{numero(r.resumo.fora)}</span></Numero>}
          <Numero rotulo="Resolvido">{String(r.resumo.pct).replace(".", ",")}%</Numero>
          {Object.entries(r.resumo.porBanco).map(([id, b]) => <Numero key={id} rotulo={nomesBanco[id] || id || "Sem banco"}>{numero(b.ok)} / {numero(b.total)}</Numero>)}
        </section>
        <div className="flex flex-wrap items-center gap-2">
          <Segmentado pequeno rotulo="Situação" valor={filtro.status} aoMudar={(v) => mudarFiltro("status", v)} opcoes={[["REVISAR", "A revisar"], ["OK", "OK"]].concat(r.resumo.fora ? [["FORA", "Fora do mês"]] : [], [["", "Todas"]])} />
          <select aria-label="Banco" value={filtro.banco} onChange={(e) => mudarFiltro("banco", e.target.value)} className="h-9 w-[160px]">
            <option value="">Todos os bancos</option>{cfg.bancos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
          <select aria-label="Categoria" value={filtro.categoria} onChange={(e) => mudarFiltro("categoria", e.target.value)} className="h-9 w-[170px]">
            <option value="">Todas as categorias</option><option value="-">Sem categoria</option>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{rotulo(c)}</option>)}
          </select>
          <input type="search" value={filtro.busca} onChange={(e) => mudarFiltro("busca", e.target.value)} placeholder="Buscar histórico, nome, CNPJ, valor…" aria-label="Buscar nas linhas" className="h-9 max-w-[300px]" />
          <span className="text-[13px] text-muted">{numero(visiveis.length)} linha(s)</span>
        </div>
        <TabelaLinhas linhas={visiveis.slice(0, limite)} nomesBanco={nomesBanco} aoAbrir={setEditando} />
        {visiveis.length > limite && <button type="button" className="btn-contorno btn-sm" onClick={() => setLimite((x) => x + POR_PAGINA)}>Mostrar mais {Math.min(POR_PAGINA, visiveis.length - limite)}</button>}
      </>)}
      {editando && <EditorLinha linha={editando} cfg={cfg} aoFechar={() => setEditando(null)} aoDecidir={decidir} aoVoltar={voltarRegra} />}
    </div>
  );
}

function TabelaLinhas({ linhas, nomesBanco, aoAbrir }) {
  if (!linhas.length) return <div className="cartao p-8 text-center text-muted">Nenhuma linha com esse filtro.</div>;
  return (
    <div className="cartao overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead className="bg-surface-2 text-left text-[12px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Data</th><th className="px-3 py-2 font-semibold">Banco</th>
              <th className="px-3 py-2 font-semibold">Histórico</th><th className="px-3 py-2 font-semibold text-right">Valor</th>
              <th className="px-3 py-2 font-semibold">Categoria e participante</th><th className="px-3 py-2 font-semibold">D / C</th>
              <th className="px-3 py-2 font-semibold">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {linhas.map((l) => (
              <tr key={l.chave} className="align-top hover:bg-surface-2/60 cursor-pointer" onClick={() => aoAbrir(l)}>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">{dataBR(l.data)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{nomesBanco[l.bancoId] || l.bancoId || "?"}</td>
                <td className="px-3 py-2 min-w-[260px] max-w-[460px]"><span className="block break-words">{l.texto}</span>
                  {l.comprovante && <span className="block text-[12px] text-info">Comprovante: {l.comprovante.nome || l.comprovante.arquivo}</span>}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap"><Valor valor={l.valor} sinal={l.valor < 0 ? "D" : "C"} /></td>
                <td className="px-3 py-2 min-w-[180px]"><span className="block font-medium">{rotulo(l.categoria)}</span>
                  <span className="block text-[12px] text-muted">{[l.participante || l.nomeSugerido, l.cnpj].filter(Boolean).join(" · ")}</span></td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums text-[12.5px]">{l.soNoOutroBanco ? <span className="text-muted">pela saída</span> : l.d ? l.d + " / " + l.c : "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {l.status === "OK" ? <Selo tipo="ok" title={l.regra}>OK</Selo> : l.foraDoMes ? <Selo tipo="neutro" title="Não entra no TXT">{l.motivo}</Selo> : <Selo tipo="pendente">{l.motivo || "Revisar"}</Selo>}
                  {l.manual && <span className="ml-1"><Selo tipo="novo" title="Decidido à mão">à mão</Selo></span>}
                  {!l.manual && l.regra && <span className="block text-[11.5px] text-muted mt-0.5">{l.regra}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditorLinha({ linha, cfg, aoFechar, aoDecidir, aoVoltar }) {
  const [d, setD] = useState({
    categoria: linha.categoria || "", participante: linha.participante || linha.nomeSugerido || "", cnpj: String(linha.cnpj || "").replace(/^CPF:/, ""),
    d: linha.categoria === "Conciliacao Manual" ? linha.d || "" : "", c: linha.categoria === "Conciliacao Manual" ? linha.c || "" : "",
    contaConsorcio: linha.contaConsorcio || "", bancoDestino: linha.bancoDestino || ""
  });
  const [regra, setRegra] = useState(false);
  const [trecho, setTrecho] = useState(() => trechoParaRegra(linha.texto));
  const contaBanco = (cfg.bancos.find((b) => b.id === linha.bancoId) || {}).conta || "";
  const set = (k, v) => setD((x) => {
    const n = Object.assign({}, x, { [k]: v });
    // conta fixa: o lado do banco já vem preenchido (saída = crédito no banco, entrada = débito)
    if (k === "categoria" && v === "Conciliacao Manual" && !x.d && !x.c) { if (linha.valor < 0) n.c = contaBanco; else n.d = contaBanco; }
    return n;
  });
  const nomes = useMemo(() => {
    const f = cfg.fornecedores || {};
    return d.categoria === "Folha" ? cfg.funcionarios : Object.keys(f).map((k) => f[k]);
  }, [cfg, d.categoria]);
  const porNome = useMemo(() => { const f = cfg.fornecedores || {}, m = {}; Object.keys(f).forEach((k) => { m[f[k]] = k; }); return m; }, [cfg]);
  const escolherNome = (v) => setD((x) => Object.assign({}, x, { participante: v }, x.categoria === "Fornecedor" && porNome[v] && !x.cnpj ? { cnpj: porNome[v] } : {}));
  const falta = !d.categoria ? "Escolha a categoria."
    : d.categoria === "Conciliacao Manual" && (!d.d || !d.c) ? "Informe a conta de débito e a de crédito."
      : d.categoria === "Consorcio" && !d.contaConsorcio ? "Informe a conta do consórcio."
        : d.categoria === "Transferencia Bancaria" && !d.bancoDestino && !linha.contaDestino ? "Escolha o outro banco."
          : regra && trecho.trim().length < 4 ? "O trecho da regra está curto demais." : "";
  const gravar = () => {
    if (falta) return;
    const dec = { categoria: d.categoria, participante: d.participante.trim(), cnpj: d.cnpj.replace(/\D/g, "") };
    if (d.categoria === "Conciliacao Manual") Object.assign(dec, { d: d.d.trim(), c: d.c.trim() });
    if (d.categoria === "Consorcio") dec.contaConsorcio = d.contaConsorcio.trim();
    if (d.categoria === "Transferencia Bancaria" && d.bancoDestino) dec.bancoDestino = d.bancoDestino;
    aoDecidir(linha, dec, regra ? trecho.trim() : "");
  };
  return (
    <Janela aberta titulo="Decidir a linha" aoFechar={aoFechar} largura="max-w-[620px]" rodape={<>
      {linha.manual && <button type="button" className="btn-fantasma mr-auto" onClick={() => aoVoltar(linha)}>Voltar para a regra</button>}
      <button type="button" className="btn-contorno" onClick={aoFechar}>Cancelar</button>
      <button type="button" className="btn-primario" disabled={!!falta} title={falta} onClick={gravar}>{regra ? "Criar a regra" : "Gravar"}</button>
    </>}>
      <div className="rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
        <div className="flex justify-between gap-3"><span className="tabular-nums">{dataBR(linha.data)} · {linha.bancoId}</span><Valor valor={linha.valor} sinal={linha.valor < 0 ? "D" : "C"} /></div>
        <div className="mt-1 break-words">{linha.texto}</div>
        {linha.comprovante && <div className="mt-1 text-info">Comprovante: {linha.comprovante.nome} {linha.comprovante.cnpj && "· " + linha.comprovante.cnpj}</div>}
        {linha.regra && <div className="mt-1 text-muted">A regra disse: {rotulo(linha.categoria)}{linha.regra ? " (" + linha.regra + ")" : ""}</div>}
      </div>
      <Campo rotulo="Categoria" id="fan-cat">
        <select id="fan-cat" value={d.categoria} onChange={(e) => set("categoria", e.target.value)}>
          <option value="">Escolha…</option>{CATEGORIAS.map((c) => <option key={c} value={c}>{rotulo(c)}</option>)}
        </select>
      </Campo>
      {(d.categoria === "Fornecedor" || d.categoria === "Folha" || d.categoria === "Recebimento") && (
        <div className="grid sm:grid-cols-[1fr_190px] gap-3">
          <Campo rotulo={d.categoria === "Folha" ? "Funcionário" : d.categoria === "Recebimento" ? "Cliente" : "Fornecedor"} id="fan-part"
            dica={d.categoria === "Fornecedor" || d.categoria === "Folha" ? "Um nome novo entra na lista e vale nos próximos meses." : ""}>
            <input id="fan-part" list="fan-nomes" value={d.participante} onChange={(e) => escolherNome(e.target.value)} />
            <datalist id="fan-nomes">{nomes.slice(0, 3000).map((n) => <option key={n} value={n} />)}</datalist>
          </Campo>
          <Campo rotulo="CNPJ / CPF" id="fan-cnpj"><input id="fan-cnpj" value={d.cnpj} onChange={(e) => set("cnpj", e.target.value)} inputMode="numeric" /></Campo>
        </div>
      )}
      {d.categoria === "Conciliacao Manual" && (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Conta de débito" id="fan-d" dica={"Banco desta linha: " + (contaBanco || "?")}><input id="fan-d" value={d.d} onChange={(e) => set("d", e.target.value)} /></Campo>
          <Campo rotulo="Conta de crédito" id="fan-c"><input id="fan-c" value={d.c} onChange={(e) => set("c", e.target.value)} /></Campo>
        </div>
      )}
      {d.categoria === "Consorcio" && <Campo rotulo="Conta do consórcio" id="fan-cons"><input id="fan-cons" value={d.contaConsorcio} onChange={(e) => set("contaConsorcio", e.target.value)} /></Campo>}
      {d.categoria === "Transferencia Bancaria" && (
        <Campo rotulo={linha.valor < 0 ? "Para qual banco foi" : "De qual banco veio"} id="fan-dest" dica={linha.contaDestino && !d.bancoDestino ? "Achado sozinho: " + linha.bancoDestino : ""}>
          <select id="fan-dest" value={d.bancoDestino} onChange={(e) => set("bancoDestino", e.target.value)}>
            <option value="">{linha.bancoDestino ? "Como foi achado (" + linha.bancoDestino + ")" : "Escolha…"}</option>
            {cfg.bancos.filter((b) => b.id !== linha.bancoId).map((b) => <option key={b.id} value={b.id}>{b.nome} ({b.conta})</option>)}
          </select>
        </Campo>
      )}
      <label className="flex items-start gap-2 text-[13.5px]">
        <input type="checkbox" checked={regra} onChange={(e) => setRegra(e.target.checked)} className="mt-1" />
        <span>Virar regra: todo histórico que tiver o trecho abaixo recebe esta decisão, neste mês e nos próximos.</span>
      </label>
      {regra && <Campo rotulo="Trecho do histórico" id="fan-trecho" dica="Deixe só o que se repete todo mês (sem datas, valores e números)."><input id="fan-trecho" value={trecho} onChange={(e) => setTrecho(e.target.value.toUpperCase())} /></Campo>}
      {falta && <p className="text-[12.5px] text-muted">{falta}</p>}
    </Janela>
  );
}

// ------------------------------------------------------------ conferência com o balancete

const NOME_STATUS = { bate: "Bate", diferenca: "Diferença", so_banco: "Só no banco", so_balancete: "Só no balancete" };

function Conferencia({ mes, r, cfg, mudarMes, setMsg }) {
  const [ver, setVer] = useState("diferenca");
  const lerBal = async (file) => {
    setMsg({ texto: "Lendo " + file.name + "…", tipo: "info" });
    try {
      const b = lerBalancetePdf(await textoDoPdf(file));
      if (!b.ok) { setMsg({ texto: b.erro, tipo: "erro" }); return; }
      mudarMes((m) => Object.assign({}, m, { balancete: { arquivo: file.name, periodo: b.periodo, fornecedores: b.fornecedores.map((f) => ({ classif: f.classif, nome: f.nome, raiz: f.raiz, debito: f.debito })) } }));
      // os nomes do balancete também ajudam a reconhecer fornecedores nos próximos meses
      fan.gravar((c) => Object.assign({}, c, { balancete: { periodo: b.periodo, fornecedores: b.fornecedores.map((f) => ({ classif: f.classif, nome: f.nome, raiz: f.raiz })) } }));
      const tot = b.fornecedores.reduce((t, f) => t + f.debito, 0);
      setMsg({ texto: numero(b.fornecedores.length) + " fornecedores no balancete" + (b.periodo ? " de " + dataBR(b.periodo.inicio) + " a " + dataBR(b.periodo.fim) : "") + ", débito total " + formatarValor(tot) + ".", tipo: "info" });
    } catch (e) { setMsg({ texto: "Não consegui ler o PDF: " + e.message, tipo: "erro" }); }
  };
  const c = useMemo(() => (mes.balancete && r ? conferirBalancete(r.linhas, mes.balancete) : null), [mes.balancete, r]);
  const linhas = c ? (ver === "sem" ? [] : c.linhas.filter((l) => !ver || l.status === ver)) : [];
  const exportar = () => {
    const esc = (v) => { const s = String(v == null ? "" : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const out = [["Situação", "Classificação", "Fornecedor", "Pagamentos", "Pago no banco", "Débito no balancete", "Diferença"].join(";")];
    c.linhas.forEach((l) => out.push([NOME_STATUS[l.status], l.fornecedor.classif, l.fornecedor.nome, l.pagos.length, formatarValor(l.totalBanco), formatarValor(l.debito), (l.diferenca < 0 ? "-" : "") + formatarValor(l.diferenca)].map(esc).join(";")));
    if (c.semFornecedor.length) { out.push(""); out.push("Pagamentos a fornecedor sem par no balancete;Data;Histórico;Valor"); c.semFornecedor.forEach((l) => out.push(["", dataBR(l.data), l.texto, formatarValor(l.valor)].map(esc).join(";"))); }
    baixarArquivos([{ nome: "Fam_conferencia_" + mes.competencia + ".csv", conteudo: "﻿" + out.join("\r\n"), tipo: "text/csv;charset=utf-8" }]);
  };
  return (
    <div className="space-y-4">
      <section className="cartao p-4 sm:p-5 space-y-3">
        <p className="text-[13.5px] text-muted max-w-[820px]">O Balancete Consolidado de fornecedores do Único (PDF) do mesmo mês. Soma o que foi pago a cada fornecedor nos extratos e compara com o débito dele no balancete. Os nomes do balancete também passam a ajudar a reconhecer fornecedores no extrato.</p>
        <div className="flex flex-wrap items-center gap-2">
          <BotaoArquivo className="btn-primario" aceita=".pdf" aoEscolher={lerBal}>{mes.balancete ? "Trocar o balancete" : "Importar o balancete (PDF)"}</BotaoArquivo>
          {mes.balancete && <span className="text-[13px] text-muted">{mes.balancete.arquivo} · {numero(mes.balancete.fornecedores.length)} fornecedores</span>}
          <div className="flex-1" />
          {c && <button type="button" className="btn-contorno btn-sm" onClick={exportar}>Baixar a conferência (CSV)</button>}
        </div>
        {!mes.extratos.length && <p className="text-[13px] text-warn">Importe os extratos do mês em "Lançamentos do mês" primeiro.</p>}
      </section>
      {c && (<>
        <Segmentado pequeno rotulo="O que mostrar" valor={ver} aoMudar={setVer} opcoes={[
          ["diferenca", "Diferença (" + c.resumo.diferenca + ")", "text-warn"], ["so_banco", "Só no banco (" + c.resumo.so_banco + ")"],
          ["so_balancete", "Só no balancete (" + c.resumo.so_balancete + ")"], ["bate", "Bate (" + c.resumo.bate + ")", "text-credit"],
          ["sem", "Sem fornecedor (" + c.resumo.semFornecedor + ")"], ["", "Todos"]]} />
        {ver === "sem" ? (
          <div className="cartao overflow-x-auto">
            {c.semFornecedor.length ? <table className="w-full text-[13.5px]"><tbody className="divide-y divide-line">
              {c.semFornecedor.map((l) => <tr key={l.chave}><td className="px-3 py-2 tabular-nums whitespace-nowrap">{dataBR(l.data)}</td><td className="px-3 py-2">{l.texto}<span className="block text-[12px] text-muted">{[l.participante, l.cnpj].filter(Boolean).join(" · ")}</span></td><td className="px-3 py-2 text-right"><Valor valor={l.valor} sinal="D" /></td></tr>)}
            </tbody></table> : <p className="p-6 text-center text-muted">Todo pagamento a fornecedor tem par no balancete.</p>}
          </div>
        ) : (
          <div className="cartao overflow-x-auto">
            {linhas.length ? <table className="w-full text-[13.5px]">
              <thead className="bg-surface-2 text-left text-[12px] uppercase tracking-wide text-muted"><tr>
                <th className="px-3 py-2 font-semibold">Fornecedor</th><th className="px-3 py-2 font-semibold text-right">Pago no banco</th>
                <th className="px-3 py-2 font-semibold text-right">Débito no balancete</th><th className="px-3 py-2 font-semibold text-right">Diferença</th><th className="px-3 py-2 font-semibold">Situação</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {linhas.slice(0, 600).map((l) => (
                  <tr key={l.fornecedor.classif} className="align-top">
                    <td className="px-3 py-2"><span className="block">{l.fornecedor.nome}</span><span className="block text-[12px] text-muted">{l.fornecedor.classif}{l.pagos.length ? " · " + l.pagos.length + " pagamento(s)" : ""}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatarValor(l.totalBanco)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatarValor(l.debito)}</td>
                    <td className={"px-3 py-2 text-right tabular-nums " + (l.diferenca ? "text-warn font-semibold" : "text-muted")}>{l.diferenca < 0 ? "-" : ""}{formatarValor(l.diferenca)}</td>
                    <td className="px-3 py-2"><Selo tipo={l.status === "bate" ? "ok" : l.status === "diferenca" ? "pendente" : "neutro"}>{NOME_STATUS[l.status]}</Selo></td>
                  </tr>
                ))}
              </tbody>
            </table> : <p className="p-6 text-center text-muted">Nada nesta situação.</p>}
          </div>
        )}
      </>)}
    </div>
  );
}

// ------------------------------------------------------------ contas, listas e regras

const CONTAS = [["fornecedor", "Fornecedores"], ["folha", "Folha (salários)"], ["recebimento", "Recebimentos (clientes)"], ["emprestimo", "Empréstimos"],
  ["fgts", "FGTS"], ["darf", "DARF"], ["iof", "IOF"], ["tarifa", "Tarifas bancárias"], ["consorcioSicredi", "Consórcio Sicredi"], ["consorcioCaixa", "Consórcio Caixa (IBC Volvo)"], ["consorcioBB", "Consórcio BB"]];

function Cadastros({ cfg, setMsg }) {
  const { confirmar } = useAvisos();
  const [busca, setBusca] = useState("");
  const [nova, setNova] = useState({ contem: "", categoria: "Conciliacao Manual", d: "", c: "banco", participante: "" });
  const gravar = (fn) => { try { fan.gravar(fn); } catch (e) { setMsg({ texto: e.message, tipo: "erro" }); } };
  const mudarConta = (k, v) => gravar((c) => Object.assign({}, c, { contas: Object.assign({}, c.contas, { [k]: v.trim() }) }));
  const mudarBanco = (id, k, v) => gravar((c) => Object.assign({}, c, { bancos: c.bancos.map((b) => (b.id !== id ? b : Object.assign({}, b, { [k]: k === "numeros" ? v.split(/[,;\s]+/).filter(Boolean) : v.trim() }))) }));

  const importarV5 = async (file) => {
    setMsg({ texto: "Lendo " + file.name + "…", tipo: "info" });
    try {
      const l = listasDaV5(await lerPlanilha(file));
      if (!l.ok) { setMsg({ texto: "Não achei as abas _FORNECEDORES e _FUNCIONARIOS nesta planilha.", tipo: "erro" }); return; }
      const nf = Object.keys(l.fornecedores).length;
      const juntar = !Object.keys(cfg.fornecedores).length || await confirmar({ titulo: "Juntar com as listas atuais?", botao: "Juntar",
        texto: "A planilha tem " + nf + " fornecedores e " + l.funcionarios.length + " funcionários. Juntar mantém o que foi aprendido no sistema; o nome da planilha vale por cima para o mesmo CNPJ." });
      if (!juntar) return;
      gravar((c) => Object.assign({}, c, {
        fornecedores: Object.assign({}, c.fornecedores, l.fornecedores),
        funcionarios: c.funcionarios.concat(l.funcionarios.filter((n) => !c.funcionarios.includes(n))),
        cheques: Object.assign({}, c.cheques, l.cheques), origemListas: { arquivo: file.name, em: new Date().toISOString() }
      }));
      setMsg({ texto: "Listas importadas: " + nf + " fornecedores, " + l.funcionarios.length + " funcionários e " + Object.keys(l.cheques).length + " cheques.", tipo: "info" });
    } catch (e) { setMsg({ texto: "Não consegui ler a planilha: " + e.message, tipo: "erro" }); }
  };
  const b = busca.trim().toUpperCase();
  const forn = Object.keys(cfg.fornecedores).filter((k) => !b || k.indexOf(b.replace(/\D/g, "") || "§") > -1 || cfg.fornecedores[k].toUpperCase().indexOf(b) > -1);
  const func = cfg.funcionarios.filter((n) => !b || n.toUpperCase().indexOf(b) > -1);
  const tirarForn = (k) => gravar((c) => { const f = Object.assign({}, c.fornecedores); delete f[k]; return Object.assign({}, c, { fornecedores: f }); });
  const tirarFunc = (n) => gravar((c) => Object.assign({}, c, { funcionarios: c.funcionarios.filter((x) => x !== n) }));
  const criarRegra = () => {
    if (nova.contem.trim().length < 4) { setMsg({ texto: "O trecho da regra está curto demais.", tipo: "aviso" }); return; }
    gravar((c) => Object.assign({}, c, { regras: c.regras.concat(Object.assign({}, nova, { contem: nova.contem.trim().toUpperCase() })) }));
    setNova({ contem: "", categoria: "Conciliacao Manual", d: "", c: "banco", participante: "" });
  };
  const tirarRegra = (i) => gravar((c) => Object.assign({}, c, { regras: c.regras.filter((_, j) => j !== i) }));

  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <section className="cartao p-4 sm:p-5 space-y-3">
        <h2 className="text-[15px] font-semibold">Empresa e contas do Único</h2>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="CNPJ da Fam" id="fan-cnpj-emp" dica="Histórico com ele = transferência entre contas."><input id="fan-cnpj-emp" defaultValue={cfg.cnpjEmpresa} onBlur={(e) => gravar((c) => Object.assign({}, c, { cnpjEmpresa: e.target.value.replace(/\D/g, "") }))} /></Campo>
          <Campo rotulo="Nome no extrato" id="fan-nome-emp"><input id="fan-nome-emp" defaultValue={cfg.nomeEmpresa} onBlur={(e) => gravar((c) => Object.assign({}, c, { nomeEmpresa: e.target.value.trim().toUpperCase() }))} /></Campo>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {CONTAS.map(([k, n]) => <Campo key={k} rotulo={n} id={"fan-ct-" + k}><input id={"fan-ct-" + k} defaultValue={cfg.contas[k]} onBlur={(e) => mudarConta(k, e.target.value)} inputMode="numeric" /></Campo>)}
        </div>
        <h3 className="text-[14px] font-semibold pt-2">Bancos</h3>
        <div className="space-y-2">
          {cfg.bancos.map((bc) => (
            <div key={bc.id} className="grid grid-cols-[1fr_80px_1.3fr] gap-2 items-end">
              <Campo rotulo="Banco" id={"fan-bn-" + bc.id}><input id={"fan-bn-" + bc.id} defaultValue={bc.nome} onBlur={(e) => mudarBanco(bc.id, "nome", e.target.value)} /></Campo>
              <Campo rotulo="Conta" id={"fan-bc-" + bc.id}><input id={"fan-bc-" + bc.id} defaultValue={bc.conta} onBlur={(e) => mudarBanco(bc.id, "conta", e.target.value)} /></Campo>
              <Campo rotulo="Números da conta no extrato" id={"fan-bnum-" + bc.id}><input id={"fan-bnum-" + bc.id} defaultValue={bc.numeros.join(", ")} onBlur={(e) => mudarBanco(bc.id, "numeros", e.target.value)} /></Campo>
            </div>
          ))}
        </div>
        <Campo rotulo="Contratos de empréstimo" id="fan-contratos" dica="Um por linha. Histórico com o número = empréstimo.">
          <textarea id="fan-contratos" rows={4} defaultValue={cfg.contratosEmprestimo.join("\n")} className="font-mono text-[13px]"
            onBlur={(e) => gravar((c) => Object.assign({}, c, { contratosEmprestimo: e.target.value.split(/\s+/).map((x) => x.trim().toUpperCase()).filter(Boolean) }))} />
        </Campo>
      </section>

      <div className="space-y-4">
        <section className="cartao p-4 sm:p-5 space-y-3">
          <h2 className="text-[15px] font-semibold">Regras da Fam</h2>
          <p className="text-[13px] text-muted">Valem antes das regras da planilha. "banco" na conta = a conta do banco do extrato.</p>
          {cfg.regras.length > 0 && (
            <ul className="divide-y divide-line border border-line rounded-lg text-[13px]">
              {cfg.regras.map((x, i) => (
                <li key={i} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1"><strong>{x.contem}</strong> → {rotulo(x.categoria)}{x.d || x.c ? " · D " + (x.d || "—") + " / C " + (x.c || "—") : ""}{x.participante ? " · " + x.participante : ""}</span>
                  <button type="button" className="btn-fantasma btn-sm" onClick={() => tirarRegra(i)}>Tirar</button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-[1.4fr_1fr_80px_80px] gap-2 items-end">
            <Campo rotulo="Histórico contém" id="fan-r-contem"><input id="fan-r-contem" value={nova.contem} onChange={(e) => setNova((n) => Object.assign({}, n, { contem: e.target.value }))} placeholder="ARRECADACAO ESTADUAL" /></Campo>
            <Campo rotulo="Categoria" id="fan-r-cat"><select id="fan-r-cat" value={nova.categoria} onChange={(e) => setNova((n) => Object.assign({}, n, { categoria: e.target.value }))}>{CATEGORIAS.map((c) => <option key={c} value={c}>{rotulo(c)}</option>)}</select></Campo>
            <Campo rotulo="Débito" id="fan-r-d"><input id="fan-r-d" value={nova.d} onChange={(e) => setNova((n) => Object.assign({}, n, { d: e.target.value }))} /></Campo>
            <Campo rotulo="Crédito" id="fan-r-c"><input id="fan-r-c" value={nova.c} onChange={(e) => setNova((n) => Object.assign({}, n, { c: e.target.value }))} /></Campo>
          </div>
          <button type="button" className="btn-contorno btn-sm" onClick={criarRegra}>Criar regra</button>
        </section>

        <section className="cartao p-4 sm:p-5 space-y-3">
          <h2 className="text-[15px] font-semibold">Fornecedores e funcionários</h2>
          <p className="text-[13px] text-muted">{numero(Object.keys(cfg.fornecedores).length)} fornecedores, {numero(cfg.funcionarios.length)} funcionários, {numero(Object.keys(cfg.cheques).length)} cheques
            {cfg.origemListas ? " · importado de " + cfg.origemListas.arquivo : ""}{cfg.balancete ? " · balancete com " + numero(cfg.balancete.fornecedores.length) + " nomes" : ""}.</p>
          <div className="flex flex-wrap gap-2 items-center">
            <BotaoArquivo aceita=".xlsm,.xlsx,.xls" aoEscolher={importarV5}>Importar da planilha v5</BotaoArquivo>
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou CNPJ…" aria-label="Buscar nas listas" className="h-9 max-w-[240px]" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="border border-line rounded-lg max-h-[360px] overflow-y-auto">
              <div className="sticky top-0 bg-surface-2 px-3 py-1.5 text-[12px] font-semibold text-muted">Fornecedores ({numero(forn.length)})</div>
              <ul className="divide-y divide-line text-[12.5px]">
                {forn.slice(0, 200).map((k) => <li key={k} className="flex items-center gap-2 px-3 py-1.5"><span className="flex-1 min-w-0"><span className="block truncate">{cfg.fornecedores[k]}</span><span className="text-muted tabular-nums">{k}</span></span>
                  <button type="button" className="btn-fantasma btn-sm" aria-label={"Tirar " + cfg.fornecedores[k]} onClick={() => tirarForn(k)}>Tirar</button></li>)}
              </ul>
            </div>
            <div className="border border-line rounded-lg max-h-[360px] overflow-y-auto">
              <div className="sticky top-0 bg-surface-2 px-3 py-1.5 text-[12px] font-semibold text-muted">Funcionários ({numero(func.length)})</div>
              <ul className="divide-y divide-line text-[12.5px]">
                {func.slice(0, 200).map((n) => <li key={n} className="flex items-center gap-2 px-3 py-1.5"><span className="flex-1 truncate">{n}</span>
                  <button type="button" className="btn-fantasma btn-sm" aria-label={"Tirar " + n} onClick={() => tirarFunc(n)}>Tirar</button></li>)}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

