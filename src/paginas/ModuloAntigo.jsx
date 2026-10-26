import { Navigate, useLocation, useParams } from "react-router-dom";
import { ROTA_REACT } from "../lib/menu.js";

/** Endereços antigos (#/modulo/mod-...): todos os módulos viraram telas em React. Leva para a tela nova, com as preferências. */
export default function ModuloAntigo() {
  const { id } = useParams();
  const local = useLocation();
  return <Navigate to={ROTA_REACT[id] || "/"} replace state={local.state} />;
}
