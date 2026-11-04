import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthCore } from "../lib/legado.js";
import { useAuth } from "../lib/auth.jsx";
import { useAvisos } from "../componentes/Avisos.jsx";
import Janela from "../componentes/Janela.jsx";
import { useDepCadastro } from "../lib/useDepCadastro.js";
import { chaveSetor, contarPorSetor, empresasDaPlanilha, lerPlanilhaCarteira, setoresDasEmpresas } from "../lib/carteira.mjs";
import { lerPlanilha } from "../lib/leitores.js";
import { BotaoArquivo } from "../componentes/contabil/ui.jsx";

/*
 * Usuários (só administradores): criar, editar, áreas de acesso, nova senha provisória, desativar,
 * excluir e, sem servidor, exportar/importar o arquivo de acessos. Regras em src/legado/auth.js.
 */
const NOME_AREA = {};
AuthCore.AREAS.forEach((a) => { NOME_AREA[a.id] = a.nome; });

function dataHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function Selo({ tipo, children, title }) {
  const cor = { ativo: "bg-ok-soft text-credit", inativo: "bg-surface-2 text-muted border border-line", provisoria: "bg-warn-soft text-warn", admin: "bg-brand-soft text-brand" }[tipo];
  return <span title={title} className={"inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold " + cor}>{children}</span>;
}
function linkDoSistema() { return location.origin + location.pathname.replace(/index\.html$/, ""); }

function mensagemAcesso(u, senha, servidor, trocar) {
  return "Olá, " + u.nome.split(" ")[0] + "! Segue o seu acesso à Central Orprocon:\n\n" +
    "Link: " + linkDoSistema() + "\n" + "E-mail: " + u.email + "\n" + (trocar ? "Senha provisória: " : "Senha: ") + senha + "\n\n" +
    (trocar ? "No primeiro acesso o sistema pede para você criar a sua própria senha." : "Guarde a senha com você; se esquecer, é só me pedir uma nova.") +
    (servidor ? "" : "\nNesta fase de testes, na primeira vez neste computador, escolha \"Importar o arquivo de acessos\" e use o arquivo que vou te enviar junto.");
}

/** Senha do acesso: vazia = o sistema gera uma provisória; "trocar" = a pessoa cria a dela no primeiro acesso. */
function CamposSenha({ senha, setSenha, trocar, setTrocar, rotulo = "Senha inicial" }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="space-y-2 rounded-lg border border-line p-3">
      <div className="space-y-1.5">
        <label className="rotulo" htmlFor="usr-senha">{rotulo} <span className="font-normal text-muted">(opcional)</span></label>
        <div className="flex gap-2">
          <input id="usr-senha" type={ver ? "text" : "password"} value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password"
            placeholder="Vazio = o sistema gera uma senha provisória" />
          <button type="button" className="btn-fantasma btn-sm shrink-0" onClick={() => setVer(!ver)}>{ver ? "Ocultar" : "Mostrar"}</button>
        </div>
        <p className="text-[12.5px] text-muted">Se escolher, use 8 ou mais caracteres, com letras e números.</p>
      </div>
      <label className="flex items-start gap-2 text-[14px]">
        <input type="checkbox" className="mt-1" checked={trocar} onChange={(e) => setTrocar(e.target.checked)} />
        <span>Pedir para trocar no primeiro acesso
          <span className="block text-[12.5px] text-muted">{trocar ? "Recomendado: só a pessoa sabe a senha dela, e o \"quem fez\" do sistema vale."
            : "A pessoa entra direto com esta senha. Use só em casos especiais (ex.: computador compartilhado)."}</span></span>
      </label>
    </div>
  );
}

function JanelaNovaSenha({ alvo, aoGerar, aoFechar }) {
  const [senha, setSenha] = useState(""), [trocar, setTrocar] = useState(true), [erro, setErro] = useState(""), [ocupado, setOcupado] = useState(false);
  useEffect(() => { if (alvo) { setSenha(""); setTrocar(true); setErro(""); setOcupado(false); } }, [alvo]);
  if (!alvo) return null;
  const gerar = () => { setErro(""); setOcupado(true); aoGerar(alvo, { senhaInicial: senha, trocarSenha: trocar }).catch((e) => { setErro(e.message); setOcupado(false); }); };
  return (
    <Janela aberta titulo={"Nova senha para " + alvo.nome} aoFechar={aoFechar} largura="max-w-[520px]"
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
        <button type="button" className="btn-primario" disabled={ocupado} onClick={gerar}>Gerar nova senha</button></>}>
      <p className="text-[13.5px] text-muted">A senha atual de {alvo.nome.split(" ")[0]} deixa de funcionar.</p>
      <CamposSenha rotulo="Nova senha" senha={senha} setSenha={setSenha} trocar={trocar} setTrocar={setTrocar} />
      {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
    </Janela>
  );
}

const dig = (v) => String(v || "").replace(/\D/g, "");
const semAc = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const docFmt = (d) => (d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d);

/**
 * Escolher as empresas de UM usuário: busca e marca as que já estão no cadastro, ou importa a planilha dele
 * (a lista do Acessórias, sem precisar da coluna de responsável).
 */
function EscolherEmpresas({ nome, inicial, aoConfirmar, aoFechar }) {
  const [svc] = useDepCadastro();
  const empresas = useMemo(() => svc.empresas().filter((c) => dig(c.documento).length >= 11), [svc]);
  const setores = useMemo(() => setoresDasEmpresas(empresas), [empresas]);
  const [sel, setSel] = useState(() => new Set(inicial || []));
  const [busca, setBusca] = useState(""), [mostrar, setMostrar] = useState("todas"), [setor, setSetor] = useState("");
  const [msg, setMsg] = useState(""), [lendo, setLendo] = useState(false);
  const b = semAc(busca.trim()), bd = dig(busca);
  const filtradas = empresas.filter((c) => {
    const d = dig(c.documento);
    if (mostrar === "marcadas" && !sel.has(d)) return false;
    if (setor && !(c.departamentos || []).some((x) => chaveSetor(x) === chaveSetor(setor))) return false;
    if (!b) return true;
    return semAc(c.nome).indexOf(b) > -1 || (bd.length >= 3 && d.indexOf(bd) > -1) || String(c.codigo || "") === busca.trim();
  });
  const LIMITE = 300;
  const mudar = (fn) => setSel((s) => { const n = new Set(s); fn(n); return n; });
  const foraDoCadastro = Array.from(sel).filter((d) => !empresas.some((c) => dig(c.documento) === d)).length;
  const importar = async (f) => {
    setMsg(""); setLendo(true);
    try {
      const r = empresasDaPlanilha(await lerPlanilha(f), empresas);
      if (!r.linhas) setMsg("Não achei empresas nesta planilha (precisa de uma coluna Empresa ou CNPJ, ou o formato do Acessórias).");
      else {
        const novas = r.cnpjs.filter((d) => !sel.has(d)).length;
        mudar((n) => r.cnpjs.forEach((d) => n.add(d)));
        setMostrar("marcadas");
        setMsg(r.cnpjs.length + " empresa(s) na planilha, " + novas + " marcada(s) agora." + (r.semEmpresa.length ? " Não achei no cadastro: " + r.semEmpresa.slice(0, 6).join("; ") + (r.semEmpresa.length > 6 ? "…" : "") : ""));
      }
    } catch (e) { setMsg(e.message || String(e)); }
    setLendo(false);
  };
  return (
    <Janela aberta titulo={"Empresas de " + (nome || "usuário")} aoFechar={aoFechar} largura="max-w-[820px]"
      rodape={<><span className="text-[13px] text-muted mr-auto self-center">{sel.size ? sel.size + " empresa(s) marcada(s)" : "Nenhuma marcada: vê todas"}</span>
        <button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
        <button type="button" className="btn-primario" onClick={() => aoConfirmar(Array.from(sel).sort())}>Usar estas empresas</button></>}>
      <div className="flex flex-wrap items-center gap-2">
        <BotaoArquivo aceita=".xlsx,.xls,.csv" aoEscolher={importar} className="btn-contorno btn-sm" disabled={lendo}>{lendo ? "Lendo…" : "Importar planilha deste usuário"}</BotaoArquivo>
        <span className="text-[12.5px] text-muted">A lista do Acessórias dele (empresa com [ID|final do CNPJ]) ou qualquer planilha com Empresa ou CNPJ.</span>
      </div>
      {msg && <p className="text-[13px] text-ink-2" role="status">{msg}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, CNPJ ou código…" aria-label="Buscar empresa" className="max-w-[260px] h-9" data-foco />
        <select value={mostrar} onChange={(e) => setMostrar(e.target.value)} aria-label="Mostrar" className="h-9 max-w-[170px]">
          <option value="todas">Todas</option><option value="marcadas">Só as marcadas</option>
        </select>
        {setores.length > 0 && <select value={setor} onChange={(e) => setSetor(e.target.value)} aria-label="Setor" className="h-9 max-w-[220px]">
          <option value="">Qualquer setor</option>{setores.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-muted">{filtradas.length} empresa(s) na lista</span>
        <button type="button" className="btn-fantasma btn-sm" disabled={!filtradas.length} onClick={() => mudar((n) => filtradas.forEach((c) => n.add(dig(c.documento))))}>Marcar as {filtradas.length}</button>
        <button type="button" className="btn-fantasma btn-sm" disabled={!filtradas.length} onClick={() => mudar((n) => filtradas.forEach((c) => n.delete(dig(c.documento))))}>Desmarcar as {filtradas.length}</button>
        {sel.size > 0 && <button type="button" className="btn-fantasma btn-sm text-debit" onClick={() => setSel(new Set())}>Limpar tudo</button>}
      </div>
      <ul className="border border-line rounded-lg divide-y divide-line max-h-[46vh] overflow-y-auto">
        {filtradas.slice(0, LIMITE).map((c) => {
          const d = dig(c.documento), m = sel.has(d);
          return (
            <li key={c.id}>
              <label className={"flex items-center gap-3 px-3 py-2 cursor-pointer text-[13.5px] " + (m ? "bg-brand-soft" : "hover:bg-surface-2")}>
                <input type="checkbox" checked={m} onChange={() => mudar((n) => (m ? n.delete(d) : n.add(d)))} />
                <span className="flex-1 min-w-0"><span className="block truncate">{c.nome}</span>
                  <span className="block text-[12px] text-muted">{docFmt(d)}{c.codigo ? " · cód. " + c.codigo : ""}{(c.departamentos || []).length ? " · " + c.departamentos.join(", ") : ""}</span></span>
                {(c.baixa || c.saida) && <span className="text-[11.5px] text-muted">{c.baixa ? "baixada" : "saiu"}</span>}
              </label>
            </li>
          );
        })}
        {!filtradas.length && <li className="px-3 py-3 text-[13px] text-muted">Nenhuma empresa com esse filtro.</li>}
        {filtradas.length > LIMITE && <li className="px-3 py-2 text-[12.5px] text-muted">Mostrando {LIMITE} de {filtradas.length}. Use a busca ou o setor para achar as outras ("Marcar" vale para todas da lista).</li>}
      </ul>
      {foraDoCadastro > 0 && <p className="text-[12.5px] text-muted">{foraDoCadastro} CNPJ(s) da carteira não estão no cadastro do Departamento Cadastro (continuam na carteira).</p>}
    </Janela>
  );
}

/**
 * Empresas que a pessoa vê: por setor (departamentos do Acessórias que vieram na importação das empresas) e/ou a
 * carteira importada (CNPJs). Nada marcado = todas.
 */
function CamposCarteira({ nome, setores, setSetores, cnpjs, setCnpjs }) {
  const [svc, v] = useDepCadastro();
  const [escolhendo, setEscolhendo] = useState(false);
  const empresas = useMemo(() => svc.empresas(), [svc, v]);   // eslint-disable-line
  const lista = useMemo(() => setoresDasEmpresas(empresas), [empresas]);
  const n = useMemo(() => contarPorSetor(empresas), [empresas]);
  const marcado = (s) => setores.some((x) => chaveSetor(x) === chaveSetor(s));
  const alternar = (s) => setSetores((l) => (marcado(s) ? l.filter((x) => chaveSetor(x) !== chaveSetor(s)) : l.concat(s)));
  const extras = setores.filter((s) => !lista.some((x) => chaveSetor(x) === chaveSetor(s)));
  return (
    <fieldset className="space-y-2">
      <legend className="rotulo mb-1">Empresas que vê</legend>
      <p className="text-[12.5px] text-muted">Nada marcado: vê todas as empresas. Marcando setores, vê só as empresas que têm esse departamento no Acessórias
        (Departamento Cadastro, Controle de horas e ISS).</p>
      {lista.length === 0 && extras.length === 0 ? (
        <p className="text-[12.5px] text-muted">Os setores aparecem aqui depois de importar as empresas do Acessórias (Departamento Cadastro › Importar).</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          {lista.concat(extras).map((s) => (
            <label key={s} className={"flex gap-2.5 items-center rounded-lg border px-2.5 py-2 cursor-pointer text-[13.5px] " + (marcado(s) ? "border-brand bg-brand-soft" : "border-line")}>
              <input type="checkbox" checked={marcado(s)} onChange={() => alternar(s)} />
              <span className="flex-1">{s}</span><span className="text-[12px] text-muted tabular-nums">{n[chaveSetor(s)] || 0}</span>
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <button type="button" className="btn-contorno btn-sm" onClick={() => setEscolhendo(true)}>Escolher empresas{cnpjs.length ? " (" + cnpjs.length + ")" : ""}</button>
        {cnpjs.length > 0
          ? <><span>Vê só estas <strong>{cnpjs.length}</strong> empresa(s){setores.length ? ", dentro dos setores marcados" : ""}.</span>
            <button type="button" className="btn-fantasma btn-sm" onClick={() => setCnpjs([])}>Tirar a carteira</button></>
          : <span className="text-muted">Sem carteira individual: marque as empresas ou importe a planilha dele.</span>}
      </div>
      {escolhendo && <EscolherEmpresas nome={nome} inicial={cnpjs} aoFechar={() => setEscolhendo(false)} aoConfirmar={(l) => { setCnpjs(l); setEscolhendo(false); }} />}
    </fieldset>
  );
}

function FormUsuario({ editando, aoSalvar, aoFechar, aberta, servidor }) {
  const [nome, setNome] = useState(""), [email, setEmail] = useState(""), [perfil, setPerfil] = useState("usuario");
  const [areas, setAreas] = useState([]), [ativo, setAtivo] = useState(true), [erro, setErro] = useState(""), [ocupado, setOcupado] = useState(false);
  const [senha, setSenha] = useState(""), [trocar, setTrocar] = useState(true);
  const [setores, setSetores] = useState([]), [cnpjs, setCnpjs] = useState([]);
  useEffect(() => {
    if (!aberta) return;
    const u = editando;
    setSetores(u ? (u.setores || []).slice() : []); setCnpjs(u ? (u.carteira || []).slice() : []);
    setNome(u ? u.nome : ""); setEmail(u ? u.email : ""); setPerfil(u ? u.perfil : "usuario");
    setAreas(u ? (u.perfil === "admin" ? AuthCore.AREAS.map((a) => a.id) : u.areas.slice()) : []);
    setAtivo(u ? u.ativo : true); setErro(""); setOcupado(false); setSenha(""); setTrocar(true);
  }, [aberta, editando]);
  const alternar = (id) => setAreas((l) => (l.indexOf(id) > -1 ? l.filter((x) => x !== id) : l.concat(id)));
  const salvar = () => {
    setErro(""); setOcupado(true);
    const dados = { nome, email, perfil, areas: perfil === "admin" ? [] : areas, ativo };
    if (servidor) dados.carteira = perfil === "admin" ? { setores: [], cnpjs: [] } : { setores, cnpjs };
    if (!editando) Object.assign(dados, { senhaInicial: senha, trocarSenha: trocar });
    aoSalvar(dados)
      .catch((e) => setErro(e.message)).finally(() => setOcupado(false));
  };
  const principal = editando && editando.email === AuthCore.ADMIN_EMAIL;
  return (
    <Janela aberta={aberta} titulo={editando ? "Editar usuário" : "Novo usuário"} aoFechar={aoFechar} largura="max-w-[680px]"
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
        <button type="button" className="btn-primario" disabled={ocupado} onClick={salvar}>{editando ? "Salvar" : "Criar usuário"}</button></>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5"><label className="rotulo" htmlFor="usr-nome">Nome</label>
          <input id="usr-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" /></div>
        <div className="space-y-1.5"><label className="rotulo" htmlFor="usr-email">E-mail</label>
          <input id="usr-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} readOnly={principal} placeholder="nome@orprocon.com.br" autoComplete="off" /></div>
      </div>
      <div className="space-y-1.5">
        <span className="rotulo">Perfil</span>
        <div className="inline-flex w-full p-1 gap-1 rounded-lg bg-surface-2 border border-line" role="radiogroup" aria-label="Perfil">
          {[["usuario", "Usuário"], ["admin", "Administrador"]].map(([id, nomeP]) => (
            <button key={id} type="button" role="radio" aria-checked={perfil === id} onClick={() => setPerfil(id)}
              className={"flex-1 rounded-md px-3 py-1.5 text-[14px] " + (perfil === id ? "bg-surface text-brand font-semibold shadow-sm" : "text-ink-2")}>{nomeP}</button>
          ))}
        </div>
        <p className="text-[12.5px] text-muted">{perfil === "admin"
          ? "Para gestores e gerentes: acessa tudo e cadastra, altera e desativa usuários (menos o administrador principal)."
          : "Usuário acessa só as áreas marcadas abaixo."}</p>
      </div>
      <fieldset disabled={perfil === "admin"} className={"space-y-2 " + (perfil === "admin" ? "opacity-55" : "")}>
        <legend className="rotulo mb-2">Pode acessar</legend>
        <div className="grid sm:grid-cols-2 gap-2">
          {AuthCore.AREAS.map((a) => {
            const marcado = perfil === "admin" || areas.indexOf(a.id) > -1;
            return (
              <label key={a.id} className={"flex gap-2.5 items-start rounded-lg border px-2.5 py-2 cursor-pointer " + (marcado ? "border-brand bg-brand-soft" : "border-line")}>
                <input type="checkbox" className="mt-1" checked={marcado} onChange={() => alternar(a.id)} />
                <span><strong className="block text-[13.5px] font-semibold">{a.nome}</strong>{a.detalhe && <span className="block text-[12px] text-muted">{a.detalhe}</span>}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {servidor && perfil !== "admin" && <CamposCarteira nome={nome} setores={setores} setSetores={setSetores} cnpjs={cnpjs} setCnpjs={setCnpjs} />}
      {!editando && <CamposSenha senha={senha} setSenha={setSenha} trocar={trocar} setTrocar={setTrocar} />}
      {editando && <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Acesso ativo</label>}
      {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
    </Janela>
  );
}

function JanelaAcesso({ dados, aoFechar, servidor }) {
  const { aviso } = useAvisos();
  if (!dados) return null;
  const trocar = dados.trocar !== false;
  const texto = mensagemAcesso(dados.usuario, dados.senha, servidor, trocar);
  const copiar = () => navigator.clipboard.writeText(texto).then(() => aviso("Mensagem copiada."));
  return (
    <Janela aberta titulo={dados.titulo} aoFechar={aoFechar} soPeloBotao largura="max-w-[560px]"
      rodape={<>
        <button type="button" className="btn-fantasma" onClick={aoFechar}>Fechar</button>
        <a className="btn-contorno" target="_blank" rel="noopener noreferrer"
          href={"mailto:" + encodeURIComponent(dados.usuario.email) + "?subject=" + encodeURIComponent("Acesso à Central Orprocon") + "&body=" + encodeURIComponent(texto)}>Enviar por e-mail</a>
        <a className="btn-contorno" target="_blank" rel="noopener noreferrer" href={"https://wa.me/?text=" + encodeURIComponent(texto)}>WhatsApp</a>
        <button type="button" className="btn-primario" onClick={copiar}>Copiar mensagem</button>
      </>}>
      <p className="text-[13px] text-muted">{trocar ? "A senha provisória aparece só agora. Envie a mensagem para a pessoa; no primeiro acesso ela cria a senha dela."
        : "A senha aparece só agora. Envie a mensagem para a pessoa; ela entra direto com esta senha."}</p>
      <textarea readOnly rows={10} value={texto} className="font-mono text-[13px] leading-relaxed" onFocus={(e) => e.target.select()} />
    </Janela>
  );
}

/** Importar carteiras: a lista do Acessórias (responsável + empresa) separa as empresas de cada usuário. */
function ImportarCarteiras({ usuarios, aoGravar, aoFechar }) {
  const [svc] = useDepCadastro();
  const [r, setR] = useState(null), [erro, setErro] = useState(""), [lendo, setLendo] = useState(false), [ocupado, setOcupado] = useState(false);
  const ler = async (f) => {
    setErro(""); setLendo(true);
    try {
      const res = lerPlanilhaCarteira(await lerPlanilha(f), usuarios.filter((u) => u.perfil !== "admin"), svc.empresas());
      if (!res.linhas) setErro("Não achei linhas com responsável e empresa nesta planilha. Me mande o arquivo para ajustar a leitura.");
      setR(res);
    } catch (e) { setErro(e.message || String(e)); }
    setLendo(false);
  };
  const gravar = () => {
    setOcupado(true);
    aoGravar(r.porUsuario.map((x) => ({ usuarioId: x.usuario.id, cnpjs: x.cnpjs }))).catch((e) => setErro(e.message)).finally(() => setOcupado(false));
  };
  return (
    <Janela aberta titulo="Importar carteiras" aoFechar={aoFechar} largura="max-w-[720px]"
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
        <button type="button" className="btn-primario" disabled={ocupado || !r || !r.porUsuario.length} onClick={gravar}>{r && r.porUsuario.length ? "Gravar " + r.porUsuario.length + " carteira(s)" : "Gravar"}</button></>}>
      <p className="text-[13.5px] text-ink-2">Planilha com o <strong>responsável</strong> (nome ou e-mail) e a <strong>empresa</strong> (CNPJ, ou o nome com [ID|final do CNPJ] como vem do Acessórias).
        Pode ser uma planilha com todos os usuários. Para quem estiver nela, a carteira é trocada; os setores marcados continuam.</p>
      <div><BotaoArquivo aceita=".xlsx,.xls,.csv" aoEscolher={ler} className="btn-contorno btn-sm" disabled={lendo}>{lendo ? "Lendo…" : "Escolher planilha"}</BotaoArquivo></div>
      {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
      {r && r.porUsuario.length > 0 && (
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-muted border-b border-line"><th className="py-1.5 font-medium">Usuário</th><th className="py-1.5 font-medium text-right">Empresas</th><th className="py-1.5 font-medium text-right">Carteira atual</th></tr></thead>
          <tbody>{r.porUsuario.map((x) => (
            <tr key={x.usuario.id} className="border-b border-line last:border-0"><td className="py-1.5">{x.usuario.nome}</td>
              <td className="py-1.5 text-right tabular-nums">{x.cnpjs.length}</td>
              <td className="py-1.5 text-right tabular-nums text-muted">{(x.usuario.carteira || []).length || "todas"}</td></tr>
          ))}</tbody>
        </table>
      )}
      {r && r.semUsuario.length > 0 && (
        <p className="text-[12.5px] text-warn">Não achei estes responsáveis entre os usuários (crie o usuário ou confira o nome): {r.semUsuario.map((s) => s.nome + " (" + s.empresas + ")").join(", ")}.</p>
      )}
      {r && r.semEmpresa.length > 0 && (
        <p className="text-[12.5px] text-muted">{r.semEmpresa.length} empresa(s) não encontradas no cadastro, ficaram de fora: {r.semEmpresa.slice(0, 8).join("; ")}{r.semEmpresa.length > 8 ? "…" : ""}</p>
      )}
    </Janela>
  );
}

export default function Usuarios() {
  const { auth, usuario, definirUsuario } = useAuth();
  const { aviso, confirmar } = useAvisos();
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState({ aberta: false, editando: null });
  const [acesso, setAcesso] = useState(null);
  const [importando, setImportando] = useState(false);
  const servidor = auth.modo === "api";
  const eu = (u) => u.id === (usuario.usuarioId || usuario.id);
  const souPrincipal = usuario.email === AuthCore.ADMIN_EMAIL;

  const carregar = useCallback(() => auth.listarUsuarios().then(setLista).catch((e) => setErro(e.message)), [auth]);
  useEffect(() => { carregar(); }, [carregar]);

  const mudouCarteira = (u, c) => !!c && (JSON.stringify((u && u.setores) || []) !== JSON.stringify(c.setores) || JSON.stringify((u && u.carteira) || []) !== JSON.stringify(c.cnpjs));
  const salvar = (dadosForm) => {
    const { carteira, ...dados } = dadosForm;
    if (form.editando) {
      const ed = form.editando;
      return auth.atualizarUsuario(ed.id, dados).then(() => (mudouCarteira(ed, carteira) ? auth.definirCarteira(ed.id, carteira) : null)).then(() => {
        setForm({ aberta: false, editando: null }); aviso("Usuário atualizado.");
        if (eu(ed)) return auth.usuarioAtual().then((u) => u && definirUsuario(u));
      }).then(carregar);
    }
    return auth.criarUsuario(dados).then((r) => (carteira && carteira.setores.length ? auth.definirCarteira(r.usuario.id, carteira).then(() => r) : r)).then((r) => {
      setForm({ aberta: false, editando: null });
      setAcesso({ usuario: r.usuario, senha: r.senhaProvisoria, trocar: r.trocarSenha, titulo: "Acesso criado" });
    }).then(carregar);
  };
  const [novaPara, setNovaPara] = useState(null);
  const novaSenha = (u) => setNovaPara(u);
  const gerarSenha = (u, opcoes) => auth.redefinirSenha(u.id, opcoes).then((r) => {
    setNovaPara(null); carregar();
    setAcesso({ usuario: r.usuario, senha: r.senhaProvisoria, trocar: r.trocarSenha, titulo: r.trocarSenha === false ? "Nova senha" : "Nova senha provisória" });
  });
  const alternarAtivo = async (u) => {
    if (u.ativo && !(await confirmar({ titulo: "Desativar " + u.nome + "?", botao: "Desativar", perigo: true,
      texto: "A pessoa não consegue mais entrar até ser ativada de novo. Nada do que ela fez é apagado." }))) return;
    auth.atualizarUsuario(u.id, { ativo: !u.ativo }).then(() => {
      carregar();
      aviso(u.ativo ? "Acesso de " + u.nome.split(" ")[0] + " desativado." : "Acesso ativado.",
        u.ativo ? { desfazer: () => auth.atualizarUsuario(u.id, { ativo: true }).then(carregar) } : {});
    }).catch((e) => aviso(e.message));
  };
  const excluir = async (u) => {
    if (!(await confirmar({ titulo: "Excluir " + u.nome + "?", botao: "Excluir", perigo: true,
      texto: u.email + "\n\nNão dá para desfazer. Se for só por um tempo, prefira Desativar." }))) return;
    auth.excluirUsuario(u.id).then(() => { aviso("Usuário excluído."); carregar(); }).catch((e) => aviso(e.message));
  };
  const exportar = () => auth.exportarAcessos().then((arq) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(arq)], { type: "application/json" }));
    a.download = "acessos-gestao-financeira-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    aviso("Arquivo de acessos baixado. Envie junto com a mensagem de acesso.");
  }).catch((e) => aviso(e.message));
  const importar = (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    f.text().then((t) => auth.importarAcessos(JSON.parse(t)))
      .then((r) => { aviso(r.novos + " novo(s) e " + r.atualizados + " atualizado(s)."); carregar(); })
      .catch((e) => aviso(e instanceof SyntaxError ? "Este não é um arquivo de acessos do sistema." : e.message));
  };

  const acoes = (u) => {
    const bloqueado = (u.principal && !souPrincipal) || u.teste;   // só o principal mexe na conta dele
    if (bloqueado) return null;
    const b = "rounded-md px-2.5 py-1.5 text-[13px] font-medium hover:bg-surface-2";
    return (
      <div className="flex flex-wrap md:flex-nowrap gap-1 md:justify-end">
        <button type="button" className={b} onClick={() => setForm({ aberta: true, editando: u })}>Editar</button>
        <button type="button" className={b} onClick={() => novaSenha(u)}>Nova senha</button>
        {!eu(u) && <button type="button" className={b} onClick={() => alternarAtivo(u)}>{u.ativo ? "Desativar" : "Ativar"}</button>}
        {!eu(u) && <button type="button" className={b + " text-debit hover:bg-debit-soft"} onClick={() => excluir(u)}>Excluir</button>}
      </div>
    );
  };
  const perfil = (u) => u.teste ? <Selo tipo="provisoria">Conta de teste</Selo> : u.principal ? <Selo tipo="admin">Administrador principal</Selo>
    : u.perfil === "admin" ? <Selo tipo="admin">Administrador</Selo> : <span className="text-[13px]">Usuário</span>;
  const situacao = (u) => !u.ativo ? <Selo tipo="inativo">Desativado</Selo>
    : u.trocarSenha ? <Selo tipo="provisoria" title="Ainda não criou a própria senha">Senha provisória</Selo> : <Selo tipo="ativo">Ativo</Selo>;
  const areas = (u) => u.perfil === "admin" ? <span className="rounded-md bg-surface-2 border border-line px-1.5 py-0.5 text-[12px]">Tudo, inclusive usuários</span>
    : u.areas.length ? u.areas.map((a) => <span key={a} className="rounded-md bg-surface-2 border border-line px-1.5 py-0.5 text-[12px]">{NOME_AREA[a] || a}</span>)
      .concat((u.setores || []).length || (u.carteira || []).length ? [<span key="carteira" className="rounded-md bg-brand-soft text-brand px-1.5 py-0.5 text-[12px]"
        title="Empresas que vê">{[(u.setores || []).join(", "), (u.carteira || []).length ? (u.carteira || []).length + " empresa(s)" : ""].filter(Boolean).join(" · ")}</span>] : [])
    : <span className="text-[12px] text-muted">Nenhuma área</span>;

  return (
    <div className="max-w-[1180px] flex flex-col gap-4">
      <section className="cartao">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="max-w-[640px]">
            <h2 className="text-[15px] font-semibold">Usuários</h2>
            <p className="text-[13px] text-muted mt-0.5">Quem pode entrar no sistema e o que cada pessoa vê. Ao criar um usuário, você escolhe a senha inicial (ou o sistema gera uma provisória) e recebe a mensagem de acesso para enviar.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!servidor && <button type="button" className="btn-fantasma btn-sm" onClick={exportar} title="Arquivo com os acessos, para a pessoa importar no computador dela">Exportar acessos</button>}
            {!servidor && <label className="btn-fantasma btn-sm">Importar acessos<input type="file" accept=".json,application/json" hidden onChange={importar} /></label>}
            {servidor && <button type="button" className="btn-contorno btn-sm" onClick={() => setImportando(true)} disabled={!lista}>Importar carteiras</button>}
            <button type="button" className="btn-primario btn-sm" onClick={() => setForm({ aberta: true, editando: null })}>Novo usuário</button>
          </div>
        </div>
        {!servidor && (
          <div role="note" className="mx-5 mb-4 rounded-lg bg-info-soft text-ink-2 px-3.5 py-2.5 text-[13px] leading-relaxed">
            <strong className="text-info">Fase de testes (sem servidor):</strong> os usuários ficam guardados neste navegador. Para alguém entrar no computador dele,
            envie também o arquivo de <em>Exportar acessos</em>; na primeira vez ele escolhe "Importar o arquivo de acessos" na tela de login. Toda vez que criar ou mudar usuários, exporte de novo.
          </div>
        )}
        {erro && <p className="px-5 pb-4 text-debit">{erro}</p>}
        {!lista && !erro && <p className="px-5 pb-4 text-muted">Carregando…</p>}
        {lista && (
          <>
            {/* computador: tabela */}
            <div className="hidden md:block overflow-x-auto border-t border-line">
              <table className="w-full text-[14px]">
                <thead><tr className="text-left text-[12px] uppercase tracking-wide text-muted">
                  {["Usuário", "Perfil", "Acesso a", "Situação", "Último acesso", ""].map((h, i) => <th key={i} className="px-5 py-2.5 font-semibold">{h}</th>)}
                </tr></thead>
                <tbody>
                  {lista.map((u) => (
                    <tr key={u.id} className={"border-t border-line align-top " + (u.ativo ? "" : "opacity-60")}>
                      <td className="px-5 py-3 min-w-[200px]"><strong className="font-semibold">{u.nome}</strong>{eu(u) && <span className="text-[12px] text-muted whitespace-nowrap"> (você)</span>}
                        <span className="block text-[12.5px] text-muted">{u.email}</span></td>
                      <td className="px-5 py-3">{perfil(u)}</td>
                      <td className="px-5 py-3"><div className="flex flex-wrap gap-1 max-w-[320px]">{areas(u)}</div></td>
                      <td className="px-5 py-3">{situacao(u)}</td>
                      <td className="px-5 py-3 text-[13px] text-muted whitespace-nowrap">{dataHora(u.ultimoAcesso)}</td>
                      <td className="px-3 py-2">{acoes(u)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* celular: cartões */}
            <ul className="md:hidden border-t border-line">
              {lista.map((u) => (
                <li key={u.id} className={"px-4 py-3 border-b border-line last:border-0 flex flex-col gap-2 " + (u.ativo ? "" : "opacity-60")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><strong className="font-semibold">{u.nome}</strong>{eu(u) && <span className="text-[12px] text-muted"> (você)</span>}
                      <span className="block text-[12.5px] text-muted truncate">{u.email}</span></div>
                    {situacao(u)}
                  </div>
                  <div className="flex flex-wrap gap-1 items-center">{perfil(u)}{areas(u)}</div>
                  <span className="text-[12px] text-muted">Último acesso: {dataHora(u.ultimoAcesso)}</span>
                  {acoes(u)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <FormUsuario aberta={form.aberta} editando={form.editando} servidor={servidor} aoSalvar={salvar} aoFechar={() => setForm({ aberta: false, editando: null })} />
      {importando && lista && <ImportarCarteiras usuarios={lista} aoFechar={() => setImportando(false)}
        aoGravar={(linhas) => auth.importarCarteiras(linhas).then(() => { setImportando(false); aviso(linhas.length + " carteira(s) gravada(s)."); carregar(); })} />}
      <JanelaNovaSenha alvo={novaPara} aoGerar={gerarSenha} aoFechar={() => setNovaPara(null)} />
      <JanelaAcesso dados={acesso} servidor={servidor} aoFechar={() => setAcesso(null)} />
    </div>
  );
}
