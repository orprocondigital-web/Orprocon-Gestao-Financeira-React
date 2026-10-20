import { useEffect, useMemo, useState } from "react";
import { Core, Importacao, Inicio } from "../lib/legado.js";
import { STATUS, ehMesmaPessoa } from "../lib/emDia.mjs";
import { useEmDia } from "../lib/useEmDia.js";
import { useAuth } from "../lib/auth.jsx";
import { lerBuffer, lerPlanilha } from "../lib/leitores.js";
import { useAvisos } from "../componentes/Avisos.jsx";
import Janela from "../componentes/Janela.jsx";
import Icone from "../componentes/Icone.jsx";
import { BotaoArquivo, Campo, Segmentado, dataBR, numero } from "../componentes/contabil/ui.jsx";

/*
 * Em Dia (simples): o que cada um faz no mês. Uma grade por setor, com as empresas nas linhas e as
 * obrigações nas colunas; um clique muda a situação (Pendente → Feito → Não se aplica).
 * Abas pequenas para a passagem de bastão e o diário. Regras em src/lib/emDia.mjs.
 */
const PROXIMO = { "": "feito", feito: "na", na: "" };
const CELULA = {
  "": "bg-warn-soft text-warn border-warn/30", feito: "bg-ok-soft text-credit border-credit/30", na: "bg-surface-2 text-muted border-line"
};
const ROTULO = { "": "Pendente", feito: "Feito", na: "N/A" };
const memoria = { aba: "grade", setor: "", mes: "" };

function mesTexto(m) { return Importacao.nomeCompetencia(m).replace(" de ", "/"); }
function somarMes(m, n) { const [a, b] = m.split("-").map(Number); const d = new Date(a, b - 1 + n, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }

// ---------------------------------------------------------------- campo que grava ao sair
function TextoRapido({ valor, aoGravar, rotulo, lista, placeholder, className = "" }) {
  const [v, setV] = useState(valor || "");
  useEffect(() => { setV(valor || ""); }, [valor]);
  return <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v.trim() !== (valor || "")) aoGravar(v); }}
    onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} aria-label={rotulo} list={lista} placeholder={placeholder}
    className={"h-8 px-2 text-[13px] border-transparent bg-transparent hover:border-line focus:bg-surface " + className} />;
}

// ---------------------------------------------------------------- colunas do setor
function JanelaColunas({ setor, aoFechar }) {
  const [svc] = useEmDia();
  const { aviso } = useAvisos();
  const [lista, setLista] = useState(setor.obrigacoes.slice());
  const [erro, setErro] = useState("");
  const salvar = () => { try { svc.salvarObrigacoes(setor.id, lista); aviso("Colunas de " + setor.nome + " atualizadas."); aoFechar(); } catch (e) { setErro(e.message); } };
  const mover = (i, d) => setLista((l) => { const n = l.slice(); const j = i + d; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; });
  return (
    <Janela aberta titulo={"Obrigações de " + setor.nome} aoFechar={aoFechar}
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button><button type="button" className="btn-primario" onClick={salvar}>Salvar</button></>}>
      <p className="text-[13px] text-muted">Cada obrigação vira uma coluna da grade. Renomear uma coluna começa ela vazia.</p>
      <ul className="space-y-1.5">
        {lista.map((o, i) => (
          <li key={i} className="flex gap-1.5">
            <input value={o} onChange={(e) => setLista((l) => l.map((x, k) => (k === i ? e.target.value : x)))} aria-label={"Obrigação " + (i + 1)} className="h-9" />
            <button type="button" className="btn-fantasma h-9 w-9 p-0" onClick={() => mover(i, -1)} aria-label="Subir" title="Subir">↑</button>
            <button type="button" className="btn-fantasma h-9 w-9 p-0" onClick={() => mover(i, 1)} aria-label="Descer" title="Descer">↓</button>
            <button type="button" className="btn-perigo h-9 w-9 p-0" onClick={() => setLista((l) => l.filter((_, k) => k !== i))} aria-label="Tirar" title="Tirar"><Icone nome="fechar" /></button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn-contorno btn-sm self-start" onClick={() => setLista((l) => l.concat(""))}><Icone nome="mais" />Obrigação</button>
      {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
    </Janela>
  );
}

// ---------------------------------------------------------------- importar
function JanelaImportar({ setorAtual, mesAtual, aoFechar }) {
  const [svc] = useEmDia();
  const { aviso } = useAvisos();
  const [lido, setLido] = useState(null);   // { tipo: "entregas"|"controle", linhas, plano }
  const [setor, setSetor] = useState(setorAtual);
  const [mes, setMes] = useState(mesAtual);
  const [status, setStatus] = useState("");
  const ler = async (file) => {
    setStatus("Lendo " + file.name + "…"); setLido(null);
    try {
      const linhas = /\.csv$|\.txt$/i.test(file.name) ? Core.textToRows(Core.decodeText(new Uint8Array(await lerBuffer(file)))) : (await lerPlanilha(file))[0].rows;
      const ehEntregas = (linhas[0] || []).some((c) => /obriga|tarefa/i.test(String(c)));
      setLido({ tipo: ehEntregas ? "entregas" : "controle", linhas, arquivo: file.name });
      setStatus("");
    } catch (e) { setStatus("Não consegui ler: " + (e.message || e)); }
  };
  const plano = useMemo(() => {
    if (!lido) return null;
    return lido.tipo === "entregas" ? svc.lerEntregas(lido.linhas) : svc.lerControle(lido.linhas, setor, mes);
  }, [lido, setor, mes, svc]);
  const resumo = useMemo(() => {
    if (!plano || plano.erro) return null;
    const meses = new Set(), emps = new Set(), setores = new Set();
    plano.itens.forEach((i) => { meses.add(i.mes); emps.add(i.empresa); setores.add(i.departamento || (svc.setores().find((s) => s.id === i.setor) || {}).nome || i.setor); });
    return { itens: plano.itens.length, meses: Array.from(meses).sort(), empresas: emps.size, setores: Array.from(setores) };
  }, [plano, svc]);
  const importar = () => {
    const r = svc.aplicarImportacao(plano.itens);
    aviso("Importado: " + numero(r.marcados) + " situação(ões) marcadas" + (r.empresasNovas ? ", " + r.empresasNovas + " empresa(s) nova(s)" : "") + ".");
    aoFechar();
  };
  return (
    <Janela aberta titulo="Importar para o Em Dia" aoFechar={aoFechar} largura="max-w-[600px]"
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
        <button type="button" className="btn-primario" disabled={!resumo || !resumo.itens} onClick={importar}>Importar</button></>}>
      <p className="text-[13.5px] text-ink-2">Aceita o CSV de gestão de entregas (Obrigação, Empresa, Status, Departamento, Responsável, Competência) e a planilha de controle (empresas nas linhas, obrigações nas colunas). O que já está como Feito não é desfeito.</p>
      <div className="flex items-center gap-3"><BotaoArquivo className="btn-contorno" aceita=".csv,.txt,.xlsx,.xls" aoEscolher={ler}>Escolher arquivo</BotaoArquivo>
        <span className="text-[13px] text-muted break-all">{lido ? lido.arquivo : "nenhum arquivo escolhido"}</span></div>
      {status && <p className="text-[13px] text-ink-2">{status}</p>}
      {lido && lido.tipo === "controle" && (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Setor desta planilha" id="imp-setor"><select id="imp-setor" value={setor} onChange={(e) => setSetor(e.target.value)}>{svc.setores().map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></Campo>
          <Campo rotulo="Competência" id="imp-mes"><input id="imp-mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} /></Campo>
        </div>
      )}
      {plano && plano.erro && <p className="text-[13px] text-debit">{plano.erro}</p>}
      {resumo && (
        <div className="rounded-lg border border-line px-3 py-2.5 text-[13.5px] space-y-1">
          <div><strong>{numero(resumo.itens)}</strong> situação(ões) de <strong>{numero(resumo.empresas)}</strong> empresa(s)</div>
          <div className="text-muted">Competência: {resumo.meses.map(mesTexto).join(", ")} · Setor: {resumo.setores.join(", ")}</div>
          {plano.obrigacoes && <div className="text-muted">Colunas: {plano.obrigacoes.join(", ")}</div>}
          {plano.avisos.length > 0 && <div className="text-warn">{plano.avisos.length} linha(s) sem competência ficaram de fora.</div>}
        </div>
      )}
    </Janela>
  );
}

// ---------------------------------------------------------------- grade
function Grade({ setorId, mes, eu }) {
  const [svc, versao] = useEmDia();
  const [pessoa, setPessoa] = useState("");
  const [pendentes, setPendentes] = useState(false);
  const [busca, setBusca] = useState("");
  const g = useMemo(() => svc.grade(mes, setorId, { pessoa, pendentes, busca }), [svc, mes, setorId, pessoa, pendentes, busca, versao]);   // eslint-disable-line
  const todos = useMemo(() => svc.grade(mes, setorId), [svc, mes, setorId, versao]);   // eslint-disable-line
  const pessoas = svc.pessoas();
  const meu = eu ? todos.porPessoa.find((p) => ehMesmaPessoa(p.pessoa, eu)) : null;
  const alternar = (l, c) => svc.definirStatus(mes, setorId, l.empresa.id, c.obrigacao, PROXIMO[c.status], eu ? eu.nome : "");
  if (!todos.linhas.length && !todos.ocultas.length) return null;
  return (
    <div className="space-y-3">
      {/* andamento: geral e por pessoa (clicar filtra) */}
      <section className="cartao p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <strong className="text-[16px]">{todos.pct}% feito</strong>
          <span className="text-[13px] text-muted">{numero(todos.feitas)} de {numero(todos.total)} em {todos.setor.nome} · {mesTexto(mes)}</span>
        </div>
        <div className="h-2 rounded-full bg-warn-soft overflow-hidden"><div className="h-full bg-credit" style={{ width: todos.pct + "%" }} /></div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setPessoa("")} className={"rounded-full border px-3 py-1 text-[13px] " + (!pessoa ? "bg-brand-soft border-brand text-brand font-semibold" : "border-line")}>Todos</button>
          {meu && <button type="button" onClick={() => setPessoa(meu.pessoa)} className={"rounded-full border px-3 py-1 text-[13px] " + (pessoa === meu.pessoa ? "bg-brand-soft border-brand text-brand font-semibold" : "border-line")}>Meus · {meu.feitas}/{meu.total}</button>}
          {todos.porPessoa.filter((p) => p !== meu).map((p) => {
            const k = p.pessoa === "(sem responsável)" ? "(sem)" : p.pessoa;
            return <button key={p.pessoa} type="button" onClick={() => setPessoa(k)} className={"rounded-full border px-3 py-1 text-[13px] " + (pessoa === k ? "bg-brand-soft border-brand text-brand font-semibold" : "border-line")}>
              {p.pessoa} · <span className={p.feitas === p.total ? "text-credit" : ""}>{p.feitas}/{p.total}</span></button>;
          })}
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa ou CNPJ…" aria-label="Buscar empresa" className="max-w-[280px] h-9" />
        <label className="inline-flex items-center gap-2 text-[13.5px]"><input type="checkbox" checked={pendentes} onChange={(e) => setPendentes(e.target.checked)} /> Só com pendência</label>
        <span className="text-[12.5px] text-muted ml-auto">Clique na situação para mudar: Pendente → Feito → N/A</span>
      </div>
      <div className="cartao overflow-hidden">
        <div className="overflow-x-auto relative">
          <table className="w-full text-[13.5px]">
            <thead className="bg-surface-2 text-left text-[12px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2.5 font-semibold min-w-[200px] sticky left-0 bg-surface-2 z-10">Empresa</th>
                <th className="px-2 py-2.5 font-semibold min-w-[130px]">Responsável</th>
                {g.setor.obrigacoes.map((o) => <th key={o} className="px-2 py-2.5 font-semibold text-center max-w-[130px]" title={o}><span className="block truncate">{o}</span></th>)}
                <th className="px-2 py-2.5 font-semibold text-center">Situação</th>
                <th className="px-2 py-2.5 font-semibold min-w-[180px]">Observação</th>
                <th className="px-1 py-2.5"><span className="sr-only">Ocultar</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {!g.linhas.length && <tr><td colSpan={g.setor.obrigacoes.length + 5} className="px-3 py-8 text-center text-muted">Nenhuma empresa com esse filtro.</td></tr>}
              {g.linhas.map((l) => (
                <tr key={l.empresa.id} className="group hover:bg-surface-2">
                  <td className="px-3 py-1.5 font-medium sticky left-0 bg-surface group-hover:bg-surface-2 z-10">{l.empresa.nome}</td>
                  <td className="px-1 py-1"><TextoRapido valor={l.responsavel} lista="emdia-pessoas" rotulo={"Responsável de " + l.empresa.nome} placeholder="—" className="w-[130px]"
                    aoGravar={(v) => svc.definirResponsavel(setorId, l.empresa.id, v)} /></td>
                  {l.celulas.map((c) => (
                    <td key={c.obrigacao} className="px-1.5 py-1 text-center">
                      <button type="button" onClick={() => alternar(l, c)} title={c.obrigacao + ": " + ROTULO[c.status] + (c.por ? " · " + c.por : "") + (c.em ? " em " + dataBR(c.em) : "")}
                        className={"min-w-[86px] h-7 px-2 rounded-full border text-[12.5px] font-semibold " + CELULA[c.status]}>{c.status === "feito" ? "✓ Feito" : ROTULO[c.status]}</button>
                    </td>
                  ))}
                  <td className="px-2 py-1 text-center whitespace-nowrap">{l.completo ? <span className="text-credit font-semibold">✓ OK</span> : <span className="text-muted tabular-nums">{l.feitas}/{l.total}</span>}</td>
                  <td className="px-1 py-1"><TextoRapido valor={l.obs} rotulo={"Observação de " + l.empresa.nome} placeholder="—" className="w-full min-w-[170px]" aoGravar={(v) => svc.definirObs(mes, setorId, l.empresa.id, v)} /></td>
                  <td className="px-1 py-1 text-right"><button type="button" onClick={() => svc.ocultar(setorId, l.empresa.id, true)} title={"Não acompanhar esta empresa em " + g.setor.nome}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 btn-fantasma h-7 w-7 p-0" aria-label={"Ocultar " + l.empresa.nome + " deste setor"}><Icone nome="fechar" className="w-4 h-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <datalist id="emdia-pessoas">{pessoas.map((p) => <option key={p} value={p} />)}{eu && !pessoas.includes(eu.nome) && <option value={eu.nome} />}</datalist>
      </div>
      {todos.ocultas.length > 0 && (
        <p className="text-[12.5px] text-muted">Fora de {g.setor.nome}: {todos.ocultas.map((c, i) => (
          <span key={c.id}>{i ? ", " : ""}{c.nome} <button type="button" className="text-brand underline" onClick={() => svc.ocultar(setorId, c.id, false)}>voltar</button></span>))}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- passagem de bastão
function Bastao({ setorId, mes, setores }) {
  const [svc, versao] = useEmDia();
  const { aviso } = useAvisos();
  const [f, setF] = useState({ de: "", para: "", motivo: "" });
  const [erro, setErro] = useState("");
  const hist = useMemo(() => svc.historicoBastao(), [svc, versao]);   // eslint-disable-line
  const pessoas = svc.pessoas();
  const passar = () => {
    try { const r = svc.passarBastao(mes, setorId, f.de, f.para, f.motivo); aviso(r.qtd + " empresa(s) passaram para " + f.para + ".", { desfazer: r.desfazer }); setF({ de: "", para: "", motivo: "" }); setErro(""); }
    catch (e) { setErro(e.message); }
  };
  const nomeSetor = (id) => (setores.find((s) => s.id === id) || { nome: id }).nome;
  return (
    <div className="space-y-4 max-w-[900px]">
      <section className="cartao p-4 sm:p-5 space-y-3">
        <h2 className="text-[16px] font-semibold">Alguém vai faltar?</h2>
        <p className="text-[13px] text-muted">As empresas com pendência de quem sai, em {nomeSetor(setorId)} e {mesTexto(mes)}, passam para quem assume. Quando a pessoa voltar, use Devolver.</p>
        <div className="grid sm:grid-cols-[1fr_1fr_1.4fr_auto] gap-2 items-end">
          <Campo rotulo="Quem sai" id="b-de"><input id="b-de" list="b-pessoas" value={f.de} onChange={(e) => setF(Object.assign({}, f, { de: e.target.value }))} autoComplete="off" /></Campo>
          <Campo rotulo="Quem assume" id="b-para"><input id="b-para" list="b-pessoas" value={f.para} onChange={(e) => setF(Object.assign({}, f, { para: e.target.value }))} autoComplete="off" /></Campo>
          <Campo rotulo="Motivo (opcional)" id="b-mot"><input id="b-mot" value={f.motivo} onChange={(e) => setF(Object.assign({}, f, { motivo: e.target.value }))} placeholder="férias, atestado…" autoComplete="off" /></Campo>
          <button type="button" className="btn-primario h-10" onClick={passar}>Passar</button>
        </div>
        <datalist id="b-pessoas">{pessoas.map((p) => <option key={p} value={p} />)}</datalist>
        {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
      </section>
      <section className="cartao overflow-hidden">
        <h2 className="px-4 pt-3.5 pb-2 text-[15px] font-semibold">Passagens</h2>
        {!hist.length ? <p className="px-4 pb-4 text-[13.5px] text-muted">Nenhuma ainda.</p> : (
          <ul className="divide-y divide-line">
            {hist.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[13.5px]">
                <span className="flex-1 min-w-[240px]"><strong>{b.de}</strong> → <strong>{b.para}</strong> · {b.empresas.length} empresa(s) · {nomeSetor(b.setor)} · {mesTexto(b.mes)}
                  <span className="block text-[12px] text-muted">{dataBR(b.em)}{b.motivo ? " · " + b.motivo : ""}{b.devolvido ? " · devolvido em " + dataBR(b.devolvido) : ""}</span></span>
                {!b.devolvido && <button type="button" className="btn-contorno btn-sm" onClick={() => { svc.devolverBastao(b.id); aviso("Empresas devolvidas para " + b.de + "."); }}>Devolver para {b.de}</button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- diário
function Diario({ setorId, eu, setores }) {
  const [svc, versao] = useEmDia();
  const { aviso } = useAvisos();
  const [texto, setTexto] = useState("");
  const [quem, setQuem] = useState(eu ? eu.nome : "");
  const [so, setSo] = useState("");
  const [erro, setErro] = useState("");
  const grupos = useMemo(() => svc.diario({ pessoa: so }), [svc, so, versao]);   // eslint-disable-line
  const anotar = (ev) => {
    ev.preventDefault();
    try { svc.anotar(quem, setorId, texto); setTexto(""); setErro(""); aviso("Anotado."); } catch (e) { setErro(e.message); }
  };
  const nomeSetor = (id) => (setores.find((s) => s.id === id) || { nome: "" }).nome;
  return (
    <div className="space-y-4 max-w-[900px]">
      <form onSubmit={anotar} className="cartao p-4 space-y-2">
        <label className="rotulo" htmlFor="d-texto">O que fiz hoje / onde parei</label>
        <textarea id="d-texto" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: folhas conferidas; parei no FGTS da empresa X." />
        <div className="flex flex-wrap items-center gap-2">
          <input value={quem} onChange={(e) => setQuem(e.target.value)} aria-label="Quem" placeholder="Seu nome" className="h-9 max-w-[200px]" />
          <span className="text-[12.5px] text-muted">em {nomeSetor(setorId)}</span>
          <button type="submit" className="btn-primario btn-sm ml-auto">Anotar</button>
        </div>
        {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
      </form>
      <div className="flex flex-wrap gap-1.5">
        {[""].concat(svc.pessoas()).map((p) => (
          <button key={p || "todos"} type="button" onClick={() => setSo(p)} className={"rounded-full border px-3 py-1 text-[13px] " + (so === p ? "bg-brand-soft border-brand text-brand font-semibold" : "border-line")}>{p || "Todos"}</button>
        ))}
      </div>
      {!grupos.length && <p className="text-[13.5px] text-muted">Nenhuma anotação nos últimos 30 dias.</p>}
      {grupos.map((gr) => (
        <section key={gr.data} className="cartao overflow-hidden">
          <h3 className="px-4 pt-3 pb-1.5 text-[13px] font-semibold text-muted">{Inicio.dataPorExtenso ? Inicio.dataPorExtenso(gr.data) : dataBR(gr.data)}</h3>
          <ul className="divide-y divide-line">
            {gr.itens.map((n) => (
              <li key={n.id} className="group flex gap-3 px-4 py-2 text-[13.5px]">
                <strong className="w-[110px] shrink-0 truncate">{n.pessoa}</strong>
                <span className="flex-1 whitespace-pre-line">{n.texto}{n.setor && <span className="text-[12px] text-muted"> · {nomeSetor(n.setor)}</span>}</span>
                <button type="button" onClick={() => svc.excluirAnotacao(n.id)} className="opacity-0 group-hover:opacity-100 focus:opacity-100 btn-fantasma h-7 w-7 p-0" aria-label="Excluir anotação"><Icone nome="fechar" className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function EmDia() {
  const [svc, versao] = useEmDia();
  const { usuario } = useAuth();
  const { aviso, confirmar } = useAvisos();
  const setores = useMemo(() => svc.setores(), [svc, versao]);   // eslint-disable-line
  const [aba, setAbaE] = useState(memoria.aba);
  const [setorId, setSetorE] = useState(memoria.setor && setores.some((s) => s.id === memoria.setor) ? memoria.setor : setores[0].id);
  const [mes, setMesE] = useState(memoria.mes || svc.mesPadrao());
  const [janela, setJanela] = useState("");
  const setAba = (v) => { memoria.aba = v; setAbaE(v); };
  const setSetor = (v) => { memoria.setor = v; setSetorE(v); };
  const setMes = (v) => { memoria.mes = v; setMesE(v); };
  const setor = setores.find((s) => s.id === setorId) || setores[0];
  const eu = usuario ? { nome: usuario.nome, email: usuario.email } : null;
  const vazio = !svc.empresas().length;
  const demo = () => aviso(svc.carregarDemonstracao(Inicio.vencimentosExemplo(svc.hoje()).clientes) ? "Demonstração carregada: responsáveis, situações e anotações fictícias." : "Já há dados: a demonstração só entra quando o Em Dia está vazio.");
  const limpar = async () => {
    if (!(await confirmar({ titulo: "Limpar o Em Dia?", perigo: true, botao: "Limpar",
      texto: "Saem as situações marcadas, os responsáveis, as passagens de bastão e o diário. As empresas e as colunas de cada setor continuam." }))) return;
    aviso("Em Dia limpo.", { desfazer: svc.limpar() });
  };
  return (
    <div className="space-y-4 max-w-[1500px]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-line bg-surface">
          <button type="button" className="btn-fantasma h-9 w-9 p-0" onClick={() => setMes(somarMes(mes, -1))} aria-label="Mês anterior">‹</button>
          <span className="px-2 text-[14px] font-semibold min-w-[130px] text-center">{mesTexto(mes)}</span>
          <button type="button" className="btn-fantasma h-9 w-9 p-0" onClick={() => setMes(somarMes(mes, 1))} aria-label="Próximo mês">›</button>
        </div>
        <Segmentado pequeno rotulo="Setor" valor={setor.id} aoMudar={setSetor} opcoes={setores.map((s) => [s.id, s.nome])} />
        <div className="flex-1" />
        <Segmentado pequeno rotulo="Ver" valor={aba} aoMudar={setAba} opcoes={[["grade", "Grade"], ["bastao", "Passagem de bastão"], ["diario", "Diário"]]} />
      </div>
      {aba === "grade" && (<>
        {vazio ? (
          <div className="cartao p-10 text-center space-y-3">
            <strong className="block text-[15px]">Nenhuma empresa cadastrada</strong>
            <span className="block text-[13.5px] text-muted">As empresas são as mesmas do Departamento Cadastro. Importe o CSV de entregas ou a planilha de controle, ou veja como fica com a demonstração.</span>
            <div className="flex justify-center gap-2"><button type="button" className="btn-primario btn-sm" onClick={() => setJanela("importar")}>Importar</button><button type="button" className="btn-contorno btn-sm" onClick={demo}>Carregar demonstração</button></div>
          </div>
        ) : <Grade setorId={setor.id} mes={mes} eu={eu} />}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className="btn-contorno btn-sm" onClick={() => setJanela("importar")}>Importar CSV ou planilha</button>
          <button type="button" className="btn-contorno btn-sm" onClick={() => setJanela("colunas")}>Obrigações de {setor.nome}</button>
          {!vazio && <button type="button" className="btn-fantasma btn-sm" onClick={demo}>Carregar demonstração</button>}
          <button type="button" className="btn-perigo btn-sm" onClick={limpar}>Limpar</button>
        </div>
      </>)}
      {aba === "bastao" && <Bastao setorId={setor.id} mes={mes} setores={setores} />}
      {aba === "diario" && <Diario setorId={setor.id} eu={eu} setores={setores} />}
      {janela === "colunas" && <JanelaColunas setor={setor} aoFechar={() => setJanela("")} />}
      {janela === "importar" && <JanelaImportar setorAtual={setor.id} mesAtual={mes} aoFechar={() => setJanela("")} />}
    </div>
  );
}
