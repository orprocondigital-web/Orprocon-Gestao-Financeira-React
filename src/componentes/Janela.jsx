import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Icone from "./Icone.jsx";

/**
 * Janela (modal): X para fechar, Esc e clique fora também fecham; os botões do rodapé ficam sempre
 * visíveis quando o conteúdo rola. soPeloBotao: só fecha pelos botões (ex.: senha provisória na tela).
 */
export default function Janela({ aberta, titulo, aoFechar, rodape, children, largura = "max-w-[440px]", soPeloBotao = false, id }) {
  const caixa = useRef(null);
  const anterior = useRef(null);
  const fora = useRef(false);   // o clique começou fora da caixa (arrastar texto para fora não fecha)
  useEffect(() => {
    if (!aberta) return;
    anterior.current = document.activeElement;
    const esc = (e) => { if (e.key === "Escape" && !soPeloBotao) { e.preventDefault(); aoFechar(); } };
    document.addEventListener("keydown", esc);
    setTimeout(() => {
      const alvo = caixa.current && caixa.current.querySelector("[data-foco], input:not([readonly]), textarea, select, button.btn-primario");
      if (alvo) alvo.focus();
    }, 30);
    return () => { document.removeEventListener("keydown", esc); if (anterior.current && anterior.current.focus) anterior.current.focus(); };
  }, [aberta]);   // eslint-disable-line
  if (!aberta) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-[rgb(30_26_21/.5)] overflow-y-auto"
      onMouseDown={(e) => { fora.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && fora.current && !soPeloBotao) aoFechar(); }}>
      <div ref={caixa} id={id} role="dialog" aria-modal="true" aria-label={titulo}
        className={"relative w-full " + largura + " max-h-[calc(100dvh-40px)] overflow-y-auto bg-surface rounded-xl shadow-pop"}>
        <div className="flex items-start justify-between gap-3 px-[22px] pt-[22px] pb-3">
          <h3 className="text-[17px] font-semibold">{titulo}</h3>
          <button type="button" aria-label="Fechar" title="Fechar (Esc)" onClick={aoFechar} className="btn-fantasma h-[34px] w-[34px] p-0 -mr-2 -mt-1"><Icone nome="fechar" /></button>
        </div>
        <div className="px-[22px] pb-4 flex flex-col gap-3.5">{children}</div>
        {rodape && <div className="sticky bottom-0 bg-surface border-t border-line px-[22px] py-3 flex flex-wrap justify-end gap-2">{rodape}</div>}
      </div>
    </div>,
    document.body
  );
}
