import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icone from "./Icone.jsx";
import { filtrarTelas, telasDoMenu } from "../lib/buscaTelas.mjs";

/*
 * Busca rápida (Ctrl+K): digita parte do nome de qualquer tela (ou da seção) e Enter abre.
 * As telas vêm do mesmo menu lateral, então só aparece o que a pessoa pode abrir.
 */
export default function BuscaRapida({ aberta, aoFechar, secoes }) {
  const navegar = useNavigate();
  const [texto, setTexto] = useState("");
  const [sel, setSel] = useState(0);
  const campo = useRef(null);
  const telas = useMemo(() => telasDoMenu(secoes), [secoes]);
  const achadas = useMemo(() => filtrarTelas(telas, texto).slice(0, 12), [telas, texto]);
  useEffect(() => { if (aberta) { setTexto(""); setSel(0); setTimeout(() => campo.current && campo.current.focus(), 0); } }, [aberta]);
  useEffect(() => { setSel(0); }, [texto]);
  if (!aberta) return null;
  const abrir = (x) => { if (!x) return; aoFechar(); navegar(x.para); };
  const tecla = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((n) => Math.min(n + 1, achadas.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((n) => Math.max(n - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); abrir(achadas[sel]); }
    else if (e.key === "Escape") { e.preventDefault(); aoFechar(); }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true" aria-label="Buscar tela">
      <div className="absolute inset-0 bg-black/40" onClick={aoFechar} />
      <div className="relative w-full max-w-[560px] cartao shadow-pop overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 border-b border-line">
          <Icone nome="busca" className="text-muted" />
          <input ref={campo} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={tecla} placeholder="Ir para… (ex.: fam, horas, certidões)"
            className="border-0 shadow-none focus:shadow-none px-0 h-12 text-[15px] bg-transparent" aria-label="Nome da tela" />
          <kbd className="text-[11px] text-muted border border-line rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-1.5" role="listbox">
          {achadas.length === 0 && <li className="px-4 py-6 text-center text-[13.5px] text-muted">Nenhuma tela com “{texto}”.</li>}
          {achadas.map((x, i) => (
            <li key={x.para + i} role="option" aria-selected={i === sel}>
              <button type="button" onMouseEnter={() => setSel(i)} onClick={() => abrir(x)}
                className={"w-full flex items-center gap-3 px-4 py-2 text-left " + (i === sel ? "bg-brand-soft" : "")}>
                <span className={"h-8 w-8 shrink-0 rounded-lg inline-flex items-center justify-center " + (i === sel ? "bg-brand-fill text-on-fill" : "bg-surface-2 text-ink-2 border border-line")}><Icone nome={x.icone} className="w-4 h-4" /></span>
                <span className="flex-1 min-w-0 leading-tight"><strong className="block truncate text-[14px] font-medium">{x.label}</strong><span className="block truncate text-[12px] text-muted">{x.onde}</span></span>
                {i === sel && <kbd className="text-[11px] text-muted border border-line rounded px-1.5 py-0.5">Enter</kbd>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
