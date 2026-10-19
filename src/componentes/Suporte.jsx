import { useEffect, useRef, useState } from "react";
import { CONFIG, Suporte as S } from "../lib/legado.js";
import Icone from "./Icone.jsx";

/** Botão flutuante de suporte: a mensagem para o WhatsApp já leva a tela, o usuário e a versão. */
export default function Suporte({ contexto, compacto = false }) {
  const cfg = (CONFIG && CONFIG.suporte) || {};
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState("duvida");
  const [texto, setTexto] = useState("");
  const [copiado, setCopiado] = useState(false);
  const painel = useRef(null);
  const campo = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    setTimeout(() => campo.current && campo.current.focus(), 30);
    const esc = (e) => { if (e.key === "Escape") setAberto(false); };
    const fora = (e) => { if (painel.current && !painel.current.contains(e.target) && !e.target.closest("#suporte-botao")) setAberto(false); };
    document.addEventListener("keydown", esc);
    document.addEventListener("mousedown", fora);
    return () => { document.removeEventListener("keydown", esc); document.removeEventListener("mousedown", fora); };
  }, [aberto]);

  if (!String(cfg.whatsapp || "").replace(/\D/g, "")) return null;
  const mensagem = () => S.mensagem(Object.assign({ tipo, texto, atendente: cfg.nome }, contexto ? contexto() : {}));

  return (
    <>
      {aberto && (
        <div ref={painel} id="suporte-painel" role="dialog" aria-labelledby="suporte-titulo"
          className="fixed z-40 right-4 left-4 sm:left-auto sm:right-5 bottom-[84px] sm:w-[360px] max-h-[calc(100vh-110px)] overflow-auto cartao shadow-pop p-[18px] flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div><h2 id="suporte-titulo" className="text-base font-semibold">Suporte do sistema</h2>
              <p className="text-[12.5px] text-muted">{cfg.nome}{cfg.papel ? " · " + cfg.papel : ""}</p></div>
            <button type="button" aria-label="Fechar" onClick={() => setAberto(false)} className="btn-fantasma h-8 w-8 p-0"><Icone nome="fechar" /></button>
          </div>
          <p className="text-[13px] leading-relaxed text-ink-2">Ficou com dúvida, algo não funcionou ou tem uma ideia? Conte aqui e chame no WhatsApp. A tela em que você está e o seu usuário já vão junto na mensagem.</p>
          <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label="Assunto">
            {S.TIPOS.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={tipo === t.id} onClick={() => setTipo(t.id)}
                className={"rounded-full border px-3 py-1.5 text-[13px] " + (tipo === t.id ? "bg-brand-soft border-brand-fill text-brand font-semibold" : "border-line-strong text-ink-2")}>{t.nome}</button>
            ))}
          </div>
          <label className="rotulo" htmlFor="suporte-texto">O que aconteceu? <span className="font-normal text-muted">(opcional)</span></label>
          <textarea ref={campo} id="suporte-texto" rows={4} maxLength={1500} value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: ao importar o extrato do Sicoob de setembro aparece a mensagem…" className="-mt-1.5 min-h-[84px]" />
          <a href={S.linkWhatsApp(cfg.whatsapp, mensagem())} target="_blank" rel="noopener noreferrer" id="suporte-enviar"
            onClick={() => setTimeout(() => { setTexto(""); setAberto(false); }, 0)}
            className="btn h-[42px] bg-[#1F8A4C] hover:bg-[#18733F] text-white">Chamar no WhatsApp</a>
          <div className="flex justify-between items-center text-[12.5px] text-muted">
            <span>{S.numeroLegivel(cfg.whatsapp)}</span>
            <button type="button" className="font-semibold text-brand underline underline-offset-2"
              onClick={() => navigator.clipboard && navigator.clipboard.writeText(mensagem()).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); })}>
              {copiado ? "Copiada!" : "Copiar a mensagem"}</button>
          </div>
        </div>
      )}
      <button type="button" id="suporte-botao" aria-expanded={aberto} aria-haspopup="dialog" onClick={() => setAberto(!aberto)}
        title="Suporte: tire uma dúvida ou avise um problema"
        className={"fixed z-40 right-4 sm:right-5 bottom-4 sm:bottom-5 inline-flex items-center justify-center gap-2 rounded-full h-[46px] font-semibold shadow-pop transition-transform hover:-translate-y-px " +
          (compacto ? "w-[46px]" : "px-[18px] pl-3.5") + " " + (aberto ? "bg-ink text-surface" : "bg-grafite text-on-grafite")}>
        <Icone nome="chat" className="w-5 h-5 text-brand-fill" />
        {!compacto && <span className="hidden sm:inline">Suporte</span>}
      </button>
    </>
  );
}
