import { CONFIG } from "../lib/legado.js";
import Icone from "../componentes/Icone.jsx";

/** Telas que ainda estão sendo passadas para o React: aponta para o sistema atual enquanto isso. */
export default function EmConstrucao({ nome }) {
  const anterior = (CONFIG && CONFIG.sistemaAnterior) || "";
  return (
    <div className="cartao max-w-xl p-8 flex flex-col gap-3">
      <span className="h-10 w-10 rounded-xl bg-brand-soft text-brand inline-flex items-center justify-center"><Icone nome="master" /></span>
      <h2 className="text-lg font-semibold">{nome} está sendo refeita em React</h2>
      <p className="text-ink-2 leading-relaxed">Esta tela entra nas próximas etapas da migração. As regras e os dados são os mesmos da versão atual, então nada se perde.</p>
      {anterior && <a className="btn-contorno self-start" href={anterior} target="_blank" rel="noopener noreferrer">Abrir no sistema atual <Icone nome="externo" className="w-4 h-4" /></a>}
    </div>
  );
}
