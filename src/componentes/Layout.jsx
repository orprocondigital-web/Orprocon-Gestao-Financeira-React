import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AuthCore, Modulos } from "../lib/legado.js";
import { useAuth } from "../lib/auth.jsx";
import { gravarLocal, lerJson, lerLocal, useTema } from "../lib/tema.js";
import { montarMenu } from "../lib/menu.js";
import Icone from "./Icone.jsx";
import Suporte from "./Suporte.jsx";
import TrocarSenha from "./TrocarSenha.jsx";
import Competencia from "./contabil/Competencia.jsx";
import { useContabil } from "../lib/useContabil.js";
import { useDepCadastro } from "../lib/useDepCadastro.js";
import { instalarApp, usePwa } from "../lib/pwa.js";

const VERSAO = "1.0.0-alpha.14";
const FECHADAS_PADRAO = { "Outras movimentações": 1, "Cadastros": 1 };

function iniciais(nome) {
  const p = String(nome || "?").trim().split(/\s+/);
  return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

function Item({ item, recolhido, contador, aoNavegar, extra }) {
  return (
    <NavLink to={item.para} end={item.para === "/"} title={item.title || item.label} onClick={aoNavegar}
      className={({ isActive }) => "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[14px] transition-colors " +
        (recolhido ? "justify-center " : "") +
        (isActive ? "bg-brand-soft text-brand font-semibold before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-brand-fill" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
      <Icone nome={item.icone} className={recolhido ? "w-5 h-5" : ""} />
      {!recolhido && <span className="flex-1 truncate">{item.label}</span>}
      {!recolhido && contador ? <span className="rounded-full bg-debit-soft text-debit text-[11px] font-bold px-1.5 min-w-[20px] text-center">{contador}</span> : null}
      {!recolhido && extra}
    </NavLink>
  );
}

function Secao({ titulo, aberta, alternar, children, recolhido, pequena }) {
  return (
    <div className={pequena ? "mt-1.5" : "mt-3.5 first:mt-1"}>
      {!recolhido && (
        <button type="button" onClick={alternar} aria-expanded={aberta}
          className={"w-full flex items-center justify-between px-2.5 py-1.5 font-semibold uppercase tracking-wider text-muted hover:text-ink " + (pequena ? "text-[11px]" : "text-[12px]")}>
          <span>{titulo}</span><Icone nome="seta" className={"w-4 h-4 transition-transform " + (aberta ? "" : "-rotate-90")} />
        </button>
      )}
      {(aberta || recolhido) && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

export default function Layout() {
  const { usuario, sair, pode } = useAuth();
  const [tema, alternarTema] = useTema();
  const local = useLocation();
  const navegar = useNavigate();
  const ehAdmin = usuario && usuario.perfil === "admin";
  const [, atualizar] = useState(0);
  const [, versaoDados] = useContabil();   // conta nova, unidade distribuída: o menu acompanha
  const [, versaoCad] = useDepCadastro();   // certidão renovada: o número no menu acompanha
  const secoes = useMemo(() => montarMenu(pode, ehAdmin), [pode, ehAdmin, local.pathname, versaoDados, versaoCad]);   // eslint-disable-line
  const [fechadas, setFechadas] = useState(() => lerJson("menu:fechadas", FECHADAS_PADRAO));
  const [integracaoAberta, setIntegracaoAberta] = useState(() => lerLocal("menu:integracao") === "aberta");
  const [recolhido, setRecolhido] = useState(() => lerLocal("menu:recolhido") === "1");
  const [gaveta, setGaveta] = useState(false);   // menu no celular
  const [trocarSenha, setTrocarSenha] = useState(false);
  const { auth } = useAuth();
  const { instalar } = usePwa();
  useEffect(() => {   // sessão: ao voltar para a aba, confere se ainda vale (12 horas sem usar encerram)
    const f = () => {
      if (document.visibilityState !== "visible" || !auth) return;
      auth.usuarioAtual().then((u) => { if (!u || u.trocarSenha) sair().then(() => navegar("/login", { replace: true, state: { expirou: true } })); });
    };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, [auth]);   // eslint-disable-line

  const alternarSecao = (t) => setFechadas((f) => { const n = Object.assign({}, f); if (n[t]) delete n[t]; else n[t] = 1; gravarLocal("menu:fechadas", JSON.stringify(n)); return n; });
  const abrirIntegracao = (sim) => { setIntegracaoAberta(sim); gravarLocal("menu:integracao", sim ? "aberta" : "fechada"); };
  useEffect(() => { gravarLocal("menu:recolhido", recolhido ? "1" : "0"); }, [recolhido]);
  useEffect(() => {   // entrar na Integração contábil (ou numa conta/cadastro) abre as partes dela
    if (/^\/(integracao|conta|cadastro)/.test(local.pathname) && !integracaoAberta) abrirIntegracao(true);
    setGaveta(false);
  }, [local.pathname]);   // eslint-disable-line
  useEffect(() => {   // os módulos gravam no navegador: o número no menu acompanha
    const f = (ev) => { if (ev.key && Modulos.ehDadoDeModulo(ev.key)) atualizar((n) => n + 1); };
    window.addEventListener("storage", f);
    return () => window.removeEventListener("storage", f);
  }, []);

  const titulo = useMemo(() => {
    for (const s of secoes) for (const i of s.itens) {
      if (local.pathname === i.para) return { sub: s.titulo, titulo: i.label };
      for (const p of i.partes || []) for (const x of p.itens) if (local.pathname === x.para) return { sub: i.label + " / " + p.titulo, titulo: x.title || x.label };
    }
    return local.pathname === "/" ? { sub: "Visão geral", titulo: "Início" } : { sub: "", titulo: "" };
  }, [secoes, local.pathname]);
  useEffect(() => { document.title = (titulo.titulo ? titulo.titulo + " – " : "") + "Central Orprocon"; }, [titulo]);

  const ehTeste = usuario && (usuario.teste || usuario.email === AuthCore.TESTE_EMAIL);
  const naModulo = local.pathname.indexOf("/modulo/") === 0;
  const comMes = /^\/(integracao|conta\/)/.test(local.pathname);   // telas que dependem do mês de trabalho

  const menu = (
    <nav aria-label="Menu principal" className="flex flex-col h-full">
      <div className={"flex items-center gap-2.5 px-3.5 pt-4 pb-3 " + (recolhido ? "flex-col" : "")}>
        <img src="./icons/orprocon-simbolo.png" alt="" className="w-8 h-8 shrink-0" />
        {!recolhido && <div className="flex-1 leading-tight min-w-0"><strong className="block text-[15px] tracking-tight truncate">Central Orprocon</strong><span className="text-[12.5px] text-muted">Empresa Contábil</span></div>}
        <button type="button" onClick={() => setRecolhido(!recolhido)} aria-label={recolhido ? "Abrir o menu" : "Recolher o menu"} title={recolhido ? "Abrir o menu" : "Recolher o menu"}
          className={"hidden lg:inline-flex btn-fantasma h-8 w-8 p-0 border border-line " + (recolhido ? "-scale-x-100" : "")}><Icone nome="recolher" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <Item item={{ para: "/", label: "Início", icone: "inicio" }} recolhido={recolhido} />
        {secoes.map((s) => (
          <Secao key={s.titulo} titulo={s.titulo} aberta={!fechadas[s.titulo]} alternar={() => alternarSecao(s.titulo)} recolhido={recolhido}>
            {s.itens.map((i) => (
              <div key={i.id}>
                <Item item={i} recolhido={recolhido} contador={i.contador || 0}
                  extra={i.partes ? (
                    <span role="button" tabIndex={0} aria-expanded={integracaoAberta} title={integracaoAberta ? "Esconder bancos, unidades e cadastros" : "Mostrar bancos, unidades e cadastros"}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirIntegracao(!integracaoAberta); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); abrirIntegracao(!integracaoAberta); } }}
                      className="-mr-1 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted hover:bg-surface hover:text-ink">
                      <Icone nome="seta" className={"w-4 h-4 transition-transform " + (integracaoAberta ? "" : "-rotate-90")} /></span>) : null} />
                {i.partes && integracaoAberta && !recolhido && (
                  <div className="ml-5 pl-2 border-l border-line my-1">
                    {i.partes.map((p) => (
                      <Secao key={p.titulo} titulo={p.titulo} pequena aberta={!fechadas[p.titulo]} alternar={() => alternarSecao(p.titulo)}>
                        {p.itens.length === 0 && p.vazio && <p className="px-2.5 py-1 text-[12.5px] text-muted">{p.vazio}</p>}
                        {p.itens.map((x, k) => (
                          <div key={x.id}>
                            {x.grupo && (k === 0 || p.itens[k - 1].grupo !== x.grupo) && <p className="px-2.5 pt-1.5 text-[12px] text-muted">{x.grupo}</p>}
                            <Item item={x} />
                          </div>
                        ))}
                      </Secao>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </Secao>
        ))}
      </div>
      <div className={"border-t border-line p-3 flex items-center gap-2.5 " + (recolhido ? "flex-col" : "")}>
        <span className="h-9 w-9 shrink-0 rounded-full bg-brand-soft text-brand font-bold text-[13px] inline-flex items-center justify-center" aria-hidden="true">{iniciais(usuario && usuario.nome)}</span>
        {!recolhido && <span className="flex-1 min-w-0 leading-tight"><strong className="block truncate text-[14px]">{usuario && usuario.nome}</strong><span className="block truncate text-[12px] text-muted">{usuario && usuario.email}</span></span>}
        {instalar && <button type="button" onClick={instalarApp} aria-label="Instalar como aplicativo" title="Instalar como aplicativo (ícone na área de trabalho, abre sem internet)" className="btn-fantasma h-8 w-8 p-0 text-brand"><Icone nome="instalar" /></button>}
        {!(usuario && usuario.teste) && <button type="button" onClick={() => setTrocarSenha(true)} aria-label="Trocar a minha senha" title="Trocar a minha senha" className="btn-fantasma h-8 w-8 p-0"><Icone nome="cadeado" /></button>}
        <button type="button" onClick={() => sair().then(() => navegar("/login", { replace: true }))} aria-label="Sair do sistema" title="Sair" className="btn-fantasma h-8 w-8 p-0"><Icone nome="sair" /></button>
      </div>
    </nav>
  );

  return (
    <div className={"min-h-full lg:grid " + (recolhido ? "lg:grid-cols-[72px_minmax(0,1fr)]" : "lg:grid-cols-[256px_minmax(0,1fr)]")}>
      <aside className="menu-lateral text-ink hidden lg:block sticky top-0 h-screen bg-surface border-r border-line">{menu}</aside>
      {gaveta && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setGaveta(false)} />
          <aside className="menu-lateral text-ink absolute left-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-surface shadow-pop">{menu}</aside>
        </div>
      )}
      <main className="min-w-0 flex flex-col min-h-screen">
        <header className="flex items-center gap-3 flex-wrap px-4 sm:px-8 py-4 border-b border-line bg-canvas">
          <button type="button" className="lg:hidden btn-contorno h-10 w-10 p-0" aria-label="Abrir o menu" onClick={() => setGaveta(true)}><Icone nome="menu" /></button>
          <div className="flex-1 min-w-0">
            {titulo.sub && <div className="text-[13px] text-muted truncate">{titulo.sub}</div>}
            <h1 className="text-[21px] sm:text-[22px] font-semibold tracking-tight truncate">{titulo.titulo}</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {comMes && <Competencia />}
            {ehTeste && <span className="rounded-full bg-brand-soft text-brand text-[12px] font-bold uppercase tracking-wide px-2.5 py-1" title="Você entrou sem senha, no modo de teste.">Modo de teste</span>}
            <span className="hidden xl:inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-muted">
              <span className="h-2 w-2 rounded-full bg-credit" aria-hidden="true" />Salvo neste navegador</span>
            <button type="button" onClick={alternarTema} className="btn-contorno h-10 w-10 p-0 rounded-full" aria-label={tema === "dark" ? "Ativar tema claro" : "Ativar tema escuro"} title={tema === "dark" ? "Tema claro" : "Tema escuro"}>
              <Icone nome={tema === "dark" ? "sol" : "lua"} /></button>
          </div>
        </header>
        <div className={"flex-1 min-w-0 " + (naModulo ? "" : "px-4 sm:px-8 py-6 pb-24")}><Outlet context={{ titulo }} /></div>
      </main>
      <TrocarSenha aberta={trocarSenha} aoFechar={() => setTrocarSenha(false)} />
      <Suporte compacto={naModulo} contexto={() => ({
        tela: (titulo.sub && titulo.sub !== titulo.titulo ? titulo.sub + " › " : "") + titulo.titulo,
        usuario: usuario ? { nome: usuario.nome, email: usuario.email } : null, versao: VERSAO, sistema: "Central Orprocon"
      })} />
    </div>
  );
}
