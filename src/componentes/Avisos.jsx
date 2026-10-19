import { createContext, useCallback, useContext, useRef, useState } from "react";
import Janela from "./Janela.jsx";
import Icone from "./Icone.jsx";

/*
 * Avisos do sistema no lugar das janelinhas do navegador:
 *   aviso("Usuário excluído.", { desfazer: fn })  → faixa embaixo, com "Desfazer" opcional
 *   await confirmar({ titulo, texto, botao, perigo })  → true/false
 */
const Contexto = createContext(null);

export function AvisosProvider({ children }) {
  const [faixa, setFaixa] = useState(null);
  const [pergunta, setPergunta] = useState(null);
  const tempo = useRef(null);

  const aviso = useCallback((texto, opcoes = {}) => {
    clearTimeout(tempo.current);
    setFaixa({ texto, desfazer: opcoes.desfazer || null, chave: Date.now() });
    tempo.current = setTimeout(() => setFaixa(null), opcoes.desfazer ? 7000 : 3200);
  }, []);
  const confirmar = useCallback((p) => new Promise((ok) => setPergunta(Object.assign({}, p, { ok }))), []);
  const responder = (sim) => { if (pergunta) pergunta.ok(sim); setPergunta(null); };

  return (
    <Contexto.Provider value={{ aviso, confirmar }}>
      {children}
      <Janela aberta={!!pergunta} titulo={pergunta ? pergunta.titulo : ""} aoFechar={() => responder(false)}
        rodape={pergunta && (<>
          <button type="button" className="btn-fantasma" onClick={() => responder(false)}>Cancelar</button>
          <button type="button" data-foco className={pergunta.perigo ? "btn bg-debit text-white hover:opacity-90" : "btn-primario"} onClick={() => responder(true)}>{pergunta.botao || "Confirmar"}</button>
        </>)}>
        {pergunta && <p className="text-[14px] leading-relaxed text-ink-2 whitespace-pre-line">{pergunta.texto}</p>}
      </Janela>
      {faixa && (
        <div key={faixa.chave} role="status" aria-live="polite"
          className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[60] flex items-center gap-4 rounded-xl bg-ink text-surface pl-[18px] pr-3.5 py-3 shadow-pop text-[14px] max-w-[calc(100vw-32px)]">
          <Icone nome="ok" className="text-brand-fill" />
          <span>{faixa.texto}</span>
          {faixa.desfazer && <button type="button" className="font-semibold text-brand-fill px-1 py-1.5" onClick={() => { faixa.desfazer(); setFaixa(null); }}>Desfazer</button>}
        </div>
      )}
    </Contexto.Provider>
  );
}

export function useAvisos() { return useContext(Contexto); }
