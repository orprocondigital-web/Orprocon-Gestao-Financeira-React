import { atualizarAgora, usePwa } from "../lib/pwa.js";
import Icone from "./Icone.jsx";

/** Faixa "Nova versão disponível": aparece em qualquer tela, inclusive no login. */
export default function AvisoAtualizacao() {
  const { atualizar, atualizando } = usePwa();
  if (!atualizar) return null;
  return (
    <div role="status" aria-live="polite"
      className="fixed left-4 lg:left-[272px] bottom-4 z-[55] max-w-[calc(100vw-32px)] flex items-center gap-3 rounded-xl bg-grafite text-on-grafite pl-4 pr-2 py-2 shadow-pop text-[14px]">
      <Icone nome="ok" className="text-brand-fill" />
      <span><strong className="font-semibold">Nova versão disponível.</strong> <span className="hidden sm:inline opacity-80">Seus dados continuam como estão.</span></span>
      <button type="button" className="btn-primario btn-sm" disabled={atualizando} onClick={atualizarAgora}>{atualizando ? "Atualizando…" : "Atualizar"}</button>
    </div>
  );
}
