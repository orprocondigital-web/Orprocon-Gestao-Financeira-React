import { useCallback, useEffect, useState } from "react";
import { AuthCore } from "../lib/legado.js";
import { useAuth } from "../lib/auth.jsx";
import { useAvisos } from "../componentes/Avisos.jsx";
import Janela from "../componentes/Janela.jsx";

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

function mensagemAcesso(u, senha, servidor) {
  return "Olá, " + u.nome.split(" ")[0] + "! Segue o seu acesso à Central Orprocon:\n\n" +
    "Link: " + linkDoSistema() + "\n" + "E-mail: " + u.email + "\n" + "Senha provisória: " + senha + "\n\n" +
    "No primeiro acesso o sistema pede para você criar a sua própria senha." +
    (servidor ? "" : "\nNesta fase de testes, na primeira vez neste computador, escolha \"Importar o arquivo de acessos\" e use o arquivo que vou te enviar junto.");
}

function FormUsuario({ editando, aoSalvar, aoFechar, aberta }) {
  const [nome, setNome] = useState(""), [email, setEmail] = useState(""), [perfil, setPerfil] = useState("usuario");
  const [areas, setAreas] = useState([]), [ativo, setAtivo] = useState(true), [erro, setErro] = useState(""), [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (!aberta) return;
    const u = editando;
    setNome(u ? u.nome : ""); setEmail(u ? u.email : ""); setPerfil(u ? u.perfil : "usuario");
    setAreas(u ? (u.perfil === "admin" ? AuthCore.AREAS.map((a) => a.id) : u.areas.slice()) : []);
    setAtivo(u ? u.ativo : true); setErro(""); setOcupado(false);
  }, [aberta, editando]);
  const alternar = (id) => setAreas((l) => (l.indexOf(id) > -1 ? l.filter((x) => x !== id) : l.concat(id)));
  const salvar = () => {
    setErro(""); setOcupado(true);
    aoSalvar({ nome, email, perfil, areas: perfil === "admin" ? [] : areas, ativo })
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
      {editando && <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Acesso ativo</label>}
      {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
    </Janela>
  );
}

function JanelaAcesso({ dados, aoFechar, servidor }) {
  const { aviso } = useAvisos();
  if (!dados) return null;
  const texto = mensagemAcesso(dados.usuario, dados.senha, servidor);
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
      <p className="text-[13px] text-muted">A senha provisória aparece só agora. Envie a mensagem para a pessoa; no primeiro acesso ela cria a senha dela.</p>
      <textarea readOnly rows={10} value={texto} className="font-mono text-[13px] leading-relaxed" onFocus={(e) => e.target.select()} />
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
  const servidor = auth.modo === "api";
  const eu = (u) => u.id === (usuario.usuarioId || usuario.id);
  const souPrincipal = usuario.email === AuthCore.ADMIN_EMAIL;

  const carregar = useCallback(() => auth.listarUsuarios().then(setLista).catch((e) => setErro(e.message)), [auth]);
  useEffect(() => { carregar(); }, [carregar]);

  const salvar = (dados) => {
    if (form.editando) {
      const ed = form.editando;
      return auth.atualizarUsuario(ed.id, dados).then(() => {
        setForm({ aberta: false, editando: null }); aviso("Usuário atualizado.");
        if (eu(ed)) return auth.usuarioAtual().then((u) => u && definirUsuario(u));
      }).then(carregar);
    }
    return auth.criarUsuario(dados).then((r) => {
      setForm({ aberta: false, editando: null });
      setAcesso({ usuario: r.usuario, senha: r.senhaProvisoria, titulo: "Acesso criado" });
    }).then(carregar);
  };
  const novaSenha = async (u) => {
    if (!(await confirmar({ titulo: "Nova senha provisória?", botao: "Gerar nova senha",
      texto: "A senha atual de " + u.nome + " deixa de funcionar, e a pessoa cria uma nova no próximo acesso." }))) return;
    auth.redefinirSenha(u.id).then((r) => { carregar(); setAcesso({ usuario: r.usuario, senha: r.senhaProvisoria, titulo: "Nova senha provisória" }); })
      .catch((e) => aviso(e.message));
  };
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
    : <span className="text-[12px] text-muted">Nenhuma área</span>;

  return (
    <div className="max-w-[1180px] flex flex-col gap-4">
      <section className="cartao">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="max-w-[640px]">
            <h2 className="text-[15px] font-semibold">Usuários</h2>
            <p className="text-[13px] text-muted mt-0.5">Quem pode entrar no sistema e o que cada pessoa vê. Ao criar um usuário, o sistema gera uma senha provisória e a mensagem de acesso para enviar.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!servidor && <button type="button" className="btn-fantasma btn-sm" onClick={exportar} title="Arquivo com os acessos, para a pessoa importar no computador dela">Exportar acessos</button>}
            {!servidor && <label className="btn-fantasma btn-sm">Importar acessos<input type="file" accept=".json,application/json" hidden onChange={importar} /></label>}
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
      <FormUsuario aberta={form.aberta} editando={form.editando} aoSalvar={salvar} aoFechar={() => setForm({ aberta: false, editando: null })} />
      <JanelaAcesso dados={acesso} servidor={servidor} aoFechar={() => setAcesso(null)} />
    </div>
  );
}
