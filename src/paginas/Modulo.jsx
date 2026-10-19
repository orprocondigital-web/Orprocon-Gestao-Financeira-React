import { useEffect, useRef } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Modulos } from "../lib/legado.js";
import { useAuth } from "../lib/auth.jsx";

/*
 * Por enquanto os módulos (ICMS, IBS/CBS, ISS, Vencimentos, Em Dia, Controle de horas) abrem como na
 * versão anterior, num quadro, a partir de public/modulos/. Cada um será refeito em React depois.
 */
function aplicarTema(m, f) {
  let doc;
  try { doc = f.contentDocument; } catch (e) { return; }
  if (!doc || !doc.documentElement) return;
  const escuro = document.documentElement.getAttribute("data-theme") === "dark";
  if (m.tema === "data-theme") doc.documentElement.setAttribute("data-theme", escuro ? "dark" : "light");
  else doc.documentElement.classList.toggle("dark", escuro);
  if (m.chaveTema) { try { localStorage.setItem(m.chaveTema, JSON.stringify(escuro ? "dark" : "light")); } catch (e) { /* ignora */ } }
}
function preparar(m, f) {
  let doc;
  try { doc = f.contentDocument; } catch (e) { return; }
  if (!doc || !doc.head) return;
  if (!doc.getElementById("gf-embutido")) {   // o tema é do sistema: some o botão de tema do módulo
    const st = doc.createElement("style");
    st.id = "gf-embutido";
    st.textContent = m.botaoTema + "{display:none!important}";
    doc.head.appendChild(st);
  }
  aplicarTema(m, f);
}

export default function Modulo() {
  const { id } = useParams();
  const local = useLocation();
  const { pode } = useAuth();
  const quadro = useRef(null);
  const m = Modulos.porId(id);
  const prefs = local.state && local.state.prefs;
  if (prefs) Object.keys(prefs).forEach((k) => { if (Modulos.ehDadoDeModulo(k)) { try { localStorage.setItem(k, String(prefs[k])); } catch (e) { /* ignora */ } } });

  useEffect(() => {
    const f = () => quadro.current && m && aplicarTema(m, quadro.current);
    window.addEventListener("gf:tema", f);
    return () => window.removeEventListener("gf:tema", f);
  }, [m]);

  if (!m) return <p className="p-8 text-muted">Módulo não encontrado.</p>;
  if (!pode(m.id)) return <p className="p-8 text-muted">Você não tem acesso a este módulo. Fale com o administrador.</p>;
  return (
    <iframe key={id + (prefs ? local.key : "")} ref={quadro} title={m.label} src={"./" + m.pasta}
      allow="fullscreen; clipboard-read; clipboard-write" onLoad={(e) => preparar(m, e.currentTarget)}
      className="block w-full border-0 h-[calc(100vh-82px)]" />
  );
}
