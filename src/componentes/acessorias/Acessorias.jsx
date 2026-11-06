import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.jsx";
import { COM_SERVIDOR } from "../../lib/sincronizacao.js";
import { haQuanto, responsaveis } from "../../lib/acessorias.mjs";
import { aplicarNoCadastro, empresasAcessorias, sincronizarAcessorias, statusAcessorias, ultimoRecebido } from "../../lib/acessoriasServidor.js";
import { useAvisos } from "../Avisos.jsx";
import { numero } from "../contabil/ui.jsx";

/*
 * Acessórias nas telas: selo "Atualizado do Acessórias há X" (Departamento Cadastro) e o painel do admin em Usuários
 * (sincronizar agora, responsáveis do Acessórias que ainda não têm acesso à Central).
 */

function useStatus() {
  const [status, setStatus] = useState(null);
  const [erro, setErro] = useState("");
  const carregar = useCallback(() => statusAcessorias().then((s) => { setStatus(s); setErro(""); }).catch((e) => setErro(e.message)), []);
  useEffect(() => {
    if (!COM_SERVIDOR) return undefined;
    carregar();
    const ouvir = () => carregar();
    window.addEventListener("gf-acessorias", ouvir);
    return () => window.removeEventListener("gf-acessorias", ouvir);
  }, [carregar]);
  return { status, erro, carregar };
}

/** Sincroniza no servidor e já passa para o Cadastro. Devolve o texto do aviso. */
async function sincronizarEAplicar(completa) {
  const s = await sincronizarAcessorias(completa);
  const st = await statusAcessorias();
  const r = await aplicarNoCadastro(st);
  return "Acessórias: " + numero(s.novas) + " empresa(s) nova(s) e " + numero(s.alteradas) + " alterada(s) no servidor"
    + " · no Cadastro: " + numero(r.novasEmp || 0) + " nova(s), " + numero(r.atualizadas || 0) + " atualizada(s)"
    + (r.responsaveis ? ", " + numero(r.responsaveis) + " responsável(is) no Em Dia" : "") + ".";
}

/** Selo do Departamento Cadastro. Admin: com o botão "Sincronizar agora". */
export function SeloAcessorias() {
  const { usuario } = useAuth();
  const { aviso } = useAvisos();
  const { status, carregar } = useStatus();
  const [ocupado, setOcupado] = useState(false);
  const admin = usuario && usuario.perfil === "admin";
  if (!COM_SERVIDOR || !status) return null;
  if (!status.configurado) return admin ? <span className="text-[12.5px] text-muted">Acessórias: falta o token no servidor (ACESSORIAS_TOKEN)</span> : null;
  const ok = status.ultimaOk, recebido = ultimoRecebido();
  const sincronizar = async () => {
    setOcupado(true);
    try { aviso(await sincronizarEAplicar(false)); } catch (e) { aviso(e.message); }
    setOcupado(false); carregar();
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-[12.5px] text-muted" title={recebido.em ? "Último recebimento neste Cadastro: " + new Date(recebido.em).toLocaleString("pt-BR") : undefined}>
      <span className={"inline-block w-2 h-2 rounded-full " + (status.ultima && !status.ultima.ok ? "bg-warn" : ok ? "bg-credit" : "bg-line")} aria-hidden="true" />
      {ok ? "Atualizado do Acessórias " + haQuanto(ok.fim) + " · " + numero(status.empresas) + " empresas" : "Acessórias ainda não sincronizado"}
      {status.ultima && !status.ultima.ok && <span className="text-warn">(a última tentativa falhou)</span>}
      {admin && <button type="button" className="btn-fantasma btn-sm" disabled={ocupado || status.sincronizando} onClick={sincronizar}>{ocupado ? "Sincronizando…" : "Sincronizar agora"}</button>}
    </span>
  );
}

/** Painel do admin em Usuários. criarAcesso(nome, email): abre o formulário de novo usuário já preenchido. */
export function PainelAcessorias({ criarAcesso }) {
  const { aviso } = useAvisos();
  const { status, erro, carregar } = useStatus();
  const [ocupado, setOcupado] = useState("");
  const [aberto, setAberto] = useState(false);
  if (!COM_SERVIDOR) return null;
  const rodar = async (completa) => {
    setOcupado(completa ? "completa" : "normal");
    try { aviso(await sincronizarEAplicar(completa)); } catch (e) { aviso(e.message); }
    setOcupado(""); carregar();
  };
  const u = status && status.ultima, ok = status && status.ultimaOk, sem = (status && status.responsaveisSemAcesso) || [];
  return (
    <section className="cartao p-4 space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[240px]">
          <h2 className="text-[15px] font-semibold">Acessórias</h2>
          <p className="text-[12.5px] text-muted">Empresas, departamentos e responsáveis vêm do Acessórias (só leitura). A carteira automática de cada usuário usa o e-mail do responsável.</p>
        </div>
        {status && status.configurado && <>
          <button type="button" className="btn-contorno btn-sm" disabled={!!ocupado || status.sincronizando} onClick={() => rodar(false)}>{ocupado === "normal" ? "Sincronizando…" : "Sincronizar agora"}</button>
          <button type="button" className="btn-fantasma btn-sm" disabled={!!ocupado || status.sincronizando} onClick={() => rodar(true)} title="Traz todas as empresas de novo (leva alguns minutos)">{ocupado === "completa" ? "Sincronizando tudo…" : "Sincronizar tudo"}</button>
        </>}
      </div>
      {erro && <p className="text-[13px] text-warn">{erro}</p>}
      {status && !status.configurado && <p className="text-[13px] text-warn">Falta configurar: crie a variável <code>ACESSORIAS_TOKEN</code> no Render com o token do Acessórias (Engrenagem › API Token).</p>}
      {status && status.configurado && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[13px]">
          <div className="rounded-lg border border-line px-3 py-2"><div className="text-[12px] text-muted">Empresas</div><div className="font-semibold tabular-nums">{numero(status.empresas)}</div></div>
          <div className="rounded-lg border border-line px-3 py-2"><div className="text-[12px] text-muted">Última que deu certo</div><div className="font-semibold">{ok ? haQuanto(ok.fim) : "nenhuma"}</div></div>
          <div className="rounded-lg border border-line px-3 py-2"><div className="text-[12px] text-muted">Na última</div><div className="font-semibold tabular-nums">{u ? numero(u.novas) + " nova(s) · " + numero(u.alteradas) + " alterada(s)" : "—"}</div></div>
          <div className={"rounded-lg border px-3 py-2 " + (sem.length ? "border-warn" : "border-line")}><div className="text-[12px] text-muted">Responsáveis sem acesso</div><div className="font-semibold tabular-nums">{numero(sem.length)}</div></div>
        </div>
      )}
      {u && !u.ok && <p className="text-[13px] text-warn">A última sincronização falhou ({haQuanto(u.inicio)}): {u.erro}</p>}
      {sem.length > 0 && (
        <div>
          <button type="button" className="btn-fantasma btn-sm" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>{aberto ? "Esconder" : "Ver"} os responsáveis do Acessórias sem acesso à Central</button>
          {aberto && (
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line text-[13px]">
              {sem.map((r) => (
                <li key={r.email} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="flex-1 min-w-[200px]"><strong>{r.nome || r.email}</strong> <span className="text-muted">{r.email}</span></span>
                  <span className="text-muted tabular-nums">{numero(r.empresas)} empresa(s)</span>
                  <button type="button" className="btn-contorno btn-sm" onClick={() => criarAcesso(r.nome, r.email)}>Criar acesso</button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[12px] text-muted">Se a pessoa já tem acesso com outro e-mail, acerte o e-mail no cadastro dela (o mesmo do Acessórias).</p>
        </div>
      )}
    </section>
  );
}

let cacheEmpresas = null;
/** Quantas empresas cada e-mail tem como responsável no Acessórias (para o formulário do usuário). */
export function useResponsaveis() {
  const [mapa, setMapa] = useState(null);
  useEffect(() => {
    if (!COM_SERVIDOR) return;
    (cacheEmpresas || (cacheEmpresas = empresasAcessorias().catch((e) => { cacheEmpresas = null; throw e; })))
      .then((l) => setMapa(responsaveis(l))).catch(() => setMapa({}));
  }, []);
  return useMemo(() => mapa, [mapa]);
}
