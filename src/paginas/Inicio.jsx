import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthCore, Inicio as I, Store } from "../lib/legado.js";
import { useAuth } from "../lib/auth.jsx";
import { lerJson, lerLocal } from "../lib/tema.js";
import { nomeDaConta } from "../lib/menu.js";
import { emDia, useEmDia } from "../lib/useEmDia.js";
import Icone from "../componentes/Icone.jsx";

const COR_SETOR = { contabil: "border-brand-fill", fiscal: "border-ink-2", pessoal: "border-credit", cadastro: "border-warn", escritorio: "border-info" };
const ICO_SETOR = { contabil: "bg-brand-soft text-brand", fiscal: "bg-surface-2 text-ink-2 border border-line", pessoal: "bg-ok-soft text-credit", cadastro: "bg-warn-soft text-warn", escritorio: "bg-info-soft text-info" };
const TOM = { marca: "text-brand", alerta: "", perigo: "text-debit" };

function mesAtual() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }

/** O resumo do dia: lê o que cada módulo gravou, com as mesmas regras deles (js de regras). */
function useResumo(usuario, pode) {
  const [versao, setVersao] = useState(0);
  const [, versaoEmDia] = useEmDia();
  useEffect(() => {
    const f = () => setVersao((n) => n + 1);
    window.addEventListener("storage", f);
    return () => window.removeEventListener("storage", f);
  }, []);
  return useMemo(() => {
    const C = I.CHAVES, competencia = lerLocal("competencia") || mesAtual();
    const fontes = {
      emDia: lerJson(C.emDia), emDiaMes: lerLocal(C.emDiaMes, ""), iss: lerJson(C.iss), issMes: lerLocal(C.issMes, ""),
      horas: lerJson(C.horas), horasMes: lerLocal(C.horasMes, ""), venc: lerJson(C.venc),
      contas: lerJson("system_banks", []).map((b) => ({ id: b.id, nome: nomeDaConta(b), lancamentos: (Store.get("lancamentos:" + competencia + ":" + b.id) || []).length }))
    };
    const ctx = { hoje: I.hojeIso(), agora: new Date(), competencia, pode,
      usuario: usuario ? { id: usuario.usuarioId || usuario.id, nome: usuario.nome, email: usuario.email } : null };
    try {
      const r = I.resumir(fontes, ctx, {});
      // Em Dia novo (grade): o fechamento do mês e as minhas pendências vêm dele
      const ed = emDia.resumo(emDia.mesPadrao(), ctx.usuario);
      if (ed.total) r.vazio = false;
      if (ed.total) r.numeros = r.numeros.map((n) => {
        if (n.id === "fechamento") return Object.assign({}, n, { rotulo: "Fechamento de " + I.rotuloMes(ed.mes).split("/")[0], valor: ed.pct + "%", sub: ed.feitas + " de " + ed.total + " feitas", pct: ed.pct, ir: pode("mod-em-dia") ? { tab: "mod-em-dia" } : null });
        if (n.id === "hoje") return Object.assign({}, n, { rotulo: "Minhas pendências", valor: String(ed.minhas), sub: ed.minhas ? "no Em Dia de " + I.rotuloMes(ed.mes).split("/")[0] : "Nada pendente com você", tom: ed.minhas ? "alerta" : "", ir: pode("mod-em-dia") ? { tab: "mod-em-dia" } : null });
        return n;
      });
      return r;
    } catch (e) { console.error("Início:", e); return null; }
  }, [usuario, pode, versao, versaoEmDia]);   // eslint-disable-line
}

export default function Inicio() {
  const { usuario, pode } = useAuth();
  const navegar = useNavigate();
  const r = useResumo(usuario, pode);
  const [msg, setMsg] = useState("");
  const ehTeste = usuario && (usuario.teste || usuario.email === AuthCore.TESTE_EMAIL);
  const C = I.CHAVES;
  const algumVazio = [C.iss, C.horas, C.venc].some((k) => !lerLocal(k)) || !lerLocal("emDia:v2");

  const ir = (alvo) => {
    if (!alvo) return;
    if (alvo.acaoApp === "extratos") { navegar("/integracao"); return; }
    if (alvo.tab === "mod-em-dia") { navegar("/em-dia"); return; }
    const dep = { "dep-empresas": "empresas", "mod-vencimentos": "certidoes", "dep-certidoes": "certidoes", "dep-alvaras": "alvaras", "dep-faturamentos": "faturamentos", "dep-demonstrativos": "demonstrativos" }[alvo.tab];
    if (dep) { navegar("/departamento-cadastro/" + dep); return; }
    navegar(alvo.tab === "master" ? "/integracao" : alvo.tab === "conciliacao" ? "/conciliacao" : "/modulo/" + alvo.tab, { state: { prefs: alvo.prefs || null } });
  };
  const exemplos = () => {
    const feitos = I.carregarExemplos((k) => lerJson(k), (k, v) => localStorage.setItem(k, JSON.stringify(v)),
      { id: usuario.usuarioId || usuario.id, nome: usuario.nome, email: usuario.email }, I.hojeIso(), (a) => a !== "mod-em-dia" && pode(a));   // o Em Dia antigo saiu
    if (pode("mod-em-dia") && emDia.carregarDemonstracao(I.vencimentosExemplo(I.hojeIso()).clientes)) feitos.push("Em Dia");
    window.dispatchEvent(new StorageEvent("storage", { key: "emDia:v2" }));
    setMsg(feitos.length ? "Exemplos carregados em: " + feitos.join(", ") + "." : "Os módulos já tinham dados; nada foi alterado.");
  };
  if (!r) return <p className="text-muted">Não consegui montar o resumo. Abra as ferramentas pelo menu.</p>;
  const setores = I.SETORES_CAPA.map((s) => Object.assign({}, s, { ferramentas: s.ferramentas.filter((f) => pode(f.area)) })).filter((s) => s.ferramentas.length);
  const qtd = setores.reduce((n, s) => n + s.ferramentas.length, 0);

  return (
    <div className="max-w-[1180px] flex flex-col gap-[22px]">
      <header className="relative overflow-hidden rounded-2xl bg-grafite text-on-grafite dark:border dark:border-line px-7 py-6 flex flex-col md:flex-row md:items-stretch justify-between gap-5">
        <div className="pointer-events-none absolute -right-16 -top-16 h-60 w-60 rounded-full" style={{ background: "radial-gradient(circle, rgb(225 154 42 / .28), transparent 70%)" }} />
        <div className="relative flex flex-col gap-1.5 max-w-[640px]">
          <span className="text-[13px] font-semibold text-brand-fill">{r.data}</span>
          <h2 className="text-[26px] font-semibold tracking-tight text-[#F7F1E6]">{r.saudacao}{r.nome ? ", " + r.nome : ""}</h2>
          <p className="text-[14.5px] leading-relaxed text-[#F4EFE6]/80">As ferramentas da Orprocon num lugar só: contábil, fiscal, departamento pessoal, cadastro e escritório. Escolha abaixo por onde começar.</p>
        </div>
        <div className="relative flex items-center gap-3 md:pl-6 md:border-l border-t md:border-t-0 border-white/15 pt-4 md:pt-0">
          <strong className="text-[44px] leading-none font-semibold text-brand-fill">{qtd}</strong>
          <span className="text-[13px] leading-snug text-[#F4EFE6]/80">ferramentas<br />disponíveis para você</span>
        </div>
      </header>

      {!r.vazio && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
          {r.numeros.map((x) => (
            <button key={x.id} type="button" disabled={!x.ir} onClick={() => ir(x.ir)}
              className="cartao text-left px-3.5 py-2.5 flex flex-col gap-1 min-w-0 enabled:hover:border-brand-fill disabled:cursor-default transition-colors">
              <span className="text-[12px] text-muted">{x.rotulo}</span>
              <span className="flex items-baseline gap-2 min-w-0">
                <strong className={"text-xl font-semibold tabular-nums " + (TOM[x.tom] || "")}>{x.valor}</strong>
                <span className={"text-[12px] truncate " + (x.tom === "alerta" ? "text-warn font-semibold" : x.tom === "perigo" ? "text-debit font-semibold" : "text-muted")}>{x.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {ehTeste && algumVazio && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-line-strong bg-brand-soft px-4 py-3.5">
          <div className="text-[13.5px]"><strong>Vai apresentar o sistema?</strong>
            <span className="block text-[12.5px] text-ink-2">Carrega clientes, empresas e documentos fictícios nos módulos que ainda estão vazios, para tudo aparecer preenchido.</span></div>
          <button type="button" className="btn-contorno btn-sm" onClick={exemplos}>Carregar dados de exemplo</button>
        </div>
      )}
      {msg && <p className="text-[13px] text-credit" role="status">{msg}</p>}

      {setores.map((s) => (
        <section key={s.id} className="flex flex-col gap-3">
          <div className={"flex flex-wrap items-baseline gap-3 pl-3 border-l-[3px] " + COR_SETOR[s.id]}>
            <h3 className="text-[17px] font-semibold">{s.nome}</h3><p className="text-[13px] text-muted">{s.texto}</p>
          </div>
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
            {s.ferramentas.map((f) => (
              <article key={f.tab} className="cartao p-[18px] flex flex-col gap-3">
                <div className="flex gap-3 items-start">
                  <span className={"h-10 w-10 shrink-0 rounded-[11px] inline-flex items-center justify-center " + ICO_SETOR[s.id]}><Icone nome={f.icone} className="w-5 h-5" /></span>
                  <div><h4 className="text-[15px] font-semibold">{f.nome}</h4><p className="text-[13px] leading-snug text-ink-2">{f.resumo}</p></div>
                </div>
                <ul className="flex-1 flex flex-col gap-1.5">
                  {f.itens.map((t) => <li key={t} className="flex gap-2 text-[13px] leading-snug text-ink-2"><Icone nome="ok" className="w-4 h-4 mt-px text-brand-fill" />{t}</li>)}
                </ul>
                <button type="button" className="btn-contorno btn-sm self-start" onClick={() => ir({ tab: f.tab })}>Abrir {f.nome}</button>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
