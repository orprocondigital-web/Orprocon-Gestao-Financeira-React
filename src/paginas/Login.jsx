import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AuthCore } from "../lib/legado.js";
import { useAuth } from "../lib/auth.jsx";
import { lerLocal, gravarLocal } from "../lib/tema.js";

const RECURSOS = [
  "Início com as ferramentas de cada setor e o resumo do dia",
  "Integração contábil com o SCI Único",
  "Extratos bancários e conciliação",
  "Apuração de ICMS e auditor IBS/CBS",
  "ISS de Tubarão (Meu ISS) e retenções",
  "Painel de vencimentos dos clientes",
  "Controle de horas do Departamento Pessoal",
  "Em Dia: fechamento do mês e diário dos setores"
];

function CampoSenha({ id, value, onChange, autoComplete }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={ver ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} className="pr-20" />
      <button type="button" onClick={() => setVer(!ver)} aria-label={ver ? "Ocultar senha" : "Mostrar senha"}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-brand px-2 py-1 rounded-md hover:bg-surface-2">
        {ver ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  );
}

function Logo({ className = "" }) {
  return (
    <>
      <img src="./icons/orprocon-logo.png" alt="Orprocon Empresa Contábil" className={"dark:hidden " + className} />
      <img src="./icons/orprocon-logo-escuro.png" alt="Orprocon Empresa Contábil" className={"hidden dark:block " + className} />
    </>
  );
}

export default function Login() {
  const { auth, carregando, erro: erroGeral, definirUsuario } = useAuth();
  const navegar = useNavigate();
  const local = useLocation();
  const [tela, setTela] = useState("carregando");   // entrar | configurar | trocar
  const [vazio, setVazio] = useState(false);
  const [email, setEmail] = useState(() => lerLocal("gf.ultimoEmail", ""));
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [s1, setS1] = useState("");
  const [s2, setS2] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");
  const senhaDigitada = useRef("");
  const arquivo = useRef(null);

  useEffect(() => {
    if (!auth) return;
    auth.precisaConfigurar().then((v) => {
      setVazio(v);
      setTela(v && !auth.modoTeste ? "configurar" : "entrar");
    });
  }, [auth]);

  const destino = (local.state && local.state.de) || "/";
  const irParaSistema = (u) => { definirUsuario(u); navegar(destino, { replace: true }); };
  const depoisDeEntrar = (u) => { if (u.trocarSenha) { setS1(""); setS2(""); setErro(""); setTela("trocar"); } else irParaSistema(u); };
  const rodar = (fn) => { setErro(""); setOcupado(true); return fn().catch((e) => setErro(e.message)).finally(() => setOcupado(false)); };

  const entrar = (ev) => {
    ev.preventDefault();
    if (!email || !senha) { setErro("Informe o e-mail e a senha."); return; }
    rodar(() => auth.entrar(email, senha).then((u) => {
      senhaDigitada.current = senha;
      gravarLocal("gf.ultimoEmail", email.trim().toLowerCase());
      depoisDeEntrar(u);
    }));
  };
  const configurar = (ev) => {
    ev.preventDefault();
    if (!nome.trim()) { setErro("Informe o seu nome."); return; }
    const p = AuthCore.problemaSenha(s1);
    if (p) { setErro(p); return; }
    if (s1 !== s2) { setErro("As duas senhas não são iguais."); return; }
    rodar(() => auth.configurarAdmin(nome.trim(), s1).then(() => auth.entrar(AuthCore.ADMIN_EMAIL, s1)).then(depoisDeEntrar));
  };
  const trocar = (ev) => {
    ev.preventDefault();
    const p = AuthCore.problemaSenha(s1);
    if (p) { setErro(p); return; }
    if (s1 !== s2) { setErro("As duas senhas não são iguais."); return; }
    if (!senhaDigitada.current) { auth.sair().then(() => { setTela("entrar"); setErro("Entre de novo com a senha provisória para criar a sua."); }); return; }
    rodar(() => auth.trocarSenha(senhaDigitada.current, s1).then(() => auth.usuarioAtual()).then((u) => { senhaDigitada.current = ""; irParaSistema(u); }));
  };
  const entrarTeste = () => rodar(() => auth.entrarTeste().then(irParaSistema));
  const importar = (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    rodar(() => f.text().then((t) => {
      let dados;
      try { dados = JSON.parse(t); } catch (e) { throw new Error("Este arquivo não é um arquivo de acessos do sistema."); }
      return auth.importarAcessos(dados);
    }).then((r) => { setVazio(false); setTela("entrar"); setAviso("Acessos importados (" + (r.novos + r.atualizados) + "). Agora entre com o seu e-mail e senha."); }));
  };

  const modoTeste = auth && auth.modoTeste;
  const servidor = auth && auth.modo === "api";

  return (
    <main className="min-h-full grid lg:grid-cols-[minmax(0,1fr)_520px] bg-canvas">
      <section className="hidden lg:flex flex-col justify-center gap-8 px-16 bg-surface border-r border-line" aria-hidden="true">
        <Logo className="w-72 max-w-full" />
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Gestão Financeira</h2>
          <ul className="mt-5 space-y-3">
            {RECURSOS.map((r) => (
              <li key={r} className="flex gap-3 text-[15px] text-ink-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-brand-fill shrink-0" />{r}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="w-full max-w-[400px] mx-auto">
          <div className="mb-8 lg:hidden"><Logo className="w-52" /></div>
          {(carregando || tela === "carregando") && !erroGeral && <p className="text-muted">Carregando…</p>}
          {erroGeral && <p className="text-debit font-medium" role="alert">{erroGeral}</p>}
          {aviso && <p className="mb-4 rounded-lg bg-ok-soft text-credit px-3 py-2 text-[13px]" role="status">{aviso}</p>}

          {tela === "entrar" && modoTeste && (
            <div className="mb-6">
              <span className="inline-block rounded-full bg-brand-soft text-brand text-xs font-bold uppercase tracking-wide px-2.5 py-1">Modo de teste</span>
              <h1 className="mt-3 text-[26px] font-semibold tracking-tight">Conheça o sistema</h1>
              <p className="mt-1 text-muted">Entre sem senha para testar. O que você fizer fica só neste computador.</p>
              <button type="button" id="btn-entrar-teste" onClick={entrarTeste} disabled={ocupado} className="btn-contorno w-full h-11 mt-4 border-brand-fill text-brand">Entrar no modo de teste</button>
              <div className="flex items-center gap-3 mt-6 text-[13px] text-muted"><span className="h-px flex-1 bg-line" />ou entre com o seu usuário<span className="h-px flex-1 bg-line" /></div>
            </div>
          )}

          {tela === "entrar" && (
            <form onSubmit={entrar} noValidate className="space-y-4">
              <div><h1 className="text-xl font-semibold">Entrar</h1><p className="text-muted mt-1">Use o e-mail e a senha que o administrador enviou.</p></div>
              <div className="space-y-1.5"><label className="rotulo" htmlFor="entrar-email">E-mail</label>
                <input id="entrar-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="space-y-1.5"><label className="rotulo" htmlFor="entrar-senha">Senha</label>
                <CampoSenha id="entrar-senha" value={senha} onChange={setSenha} autoComplete="current-password" /></div>
              {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
              <button type="submit" disabled={ocupado} className="btn-primario w-full h-11">Entrar</button>
              <p className="text-[13px] text-muted">Esqueceu a senha? Peça ao administrador para redefinir.</p>
              {!servidor && <p className="text-[13px] text-muted">Primeira vez neste computador?{" "}
                <button type="button" className="font-semibold text-brand underline underline-offset-2" onClick={() => arquivo.current.click()}>Importar o arquivo de acessos</button></p>}
              {vazio && modoTeste && <p className="text-[13px] text-muted">Administrador principal, primeira vez aqui?{" "}
                <button type="button" className="font-semibold text-brand underline underline-offset-2" onClick={() => { setErro(""); setTela("configurar"); }}>Criar o primeiro acesso</button></p>}
            </form>
          )}

          {tela === "configurar" && (
            <form onSubmit={configurar} noValidate className="space-y-4">
              <div><h1 className="text-xl font-semibold">Primeiro acesso</h1>
                <p className="text-muted mt-1">{servidor ? "Ainda não há nenhum acesso no servidor." : "Ainda não há nenhum acesso neste computador."} Crie a senha do administrador principal.</p></div>
              <div className="space-y-1.5"><label className="rotulo" htmlFor="cfg-email">E-mail do administrador</label>
                <input id="cfg-email" value={AuthCore.ADMIN_EMAIL} readOnly className="text-muted" /></div>
              <div className="space-y-1.5"><label className="rotulo" htmlFor="cfg-nome">Seu nome</label>
                <input id="cfg-nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
              <div className="space-y-1.5"><label className="rotulo" htmlFor="cfg-senha">Senha</label>
                <CampoSenha id="cfg-senha" value={s1} onChange={setS1} autoComplete="new-password" /></div>
              <div className="space-y-1.5"><label className="rotulo" htmlFor="cfg-senha2">Repita a senha</label>
                <CampoSenha id="cfg-senha2" value={s2} onChange={setS2} autoComplete="new-password" /></div>
              {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
              <button type="submit" disabled={ocupado} className="btn-primario w-full h-11">Criar acesso e entrar</button>
              {modoTeste && <button type="button" className="btn-fantasma w-full" onClick={() => { setErro(""); setTela("entrar"); }}>Voltar</button>}
            </form>
          )}

          {tela === "trocar" && (
            <form onSubmit={trocar} noValidate className="space-y-4">
              <div><h1 className="text-xl font-semibold">Crie a sua senha</h1><p className="text-muted mt-1">A senha que você recebeu é provisória. Escolha uma só sua.</p></div>
              <div className="space-y-1.5"><label className="rotulo" htmlFor="trocar-senha">Nova senha</label>
                <CampoSenha id="trocar-senha" value={s1} onChange={setS1} autoComplete="new-password" />
                <span className="text-[12px] text-muted">Pelo menos 8 caracteres, com letras e números.</span></div>
              <div className="space-y-1.5"><label className="rotulo" htmlFor="trocar-senha2">Repita a nova senha</label>
                <CampoSenha id="trocar-senha2" value={s2} onChange={setS2} autoComplete="new-password" /></div>
              {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
              <button type="submit" disabled={ocupado} className="btn-primario w-full h-11">Salvar e entrar</button>
            </form>
          )}
          <input ref={arquivo} type="file" accept=".json,application/json" hidden onChange={importar} />
        </div>
      </section>
    </main>
  );
}
