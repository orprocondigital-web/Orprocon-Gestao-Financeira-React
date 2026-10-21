import { useEffect, useState } from "react";

/** Tema claro/escuro: o mesmo "tema" do localStorage da versão anterior. */
export function useTema() {
  const [tema, setTema] = useState(() => document.documentElement.getAttribute("data-theme") || "light");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema);
    try { localStorage.setItem("tema", tema); } catch (e) { /* sem armazenamento: só nesta aba */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", tema === "dark" ? "#11141A" : "#1B273D");
    window.dispatchEvent(new CustomEvent("gf:tema", { detail: tema }));
  }, [tema]);
  return [tema, () => setTema((t) => (t === "dark" ? "light" : "dark"))];
}

/** Lê e grava no localStorage sem quebrar quando o navegador bloqueia. */
export function lerLocal(chave, padrao = null) {
  try { const v = localStorage.getItem(chave); return v === null ? padrao : v; } catch (e) { return padrao; }
}
export function gravarLocal(chave, valor) {
  try { localStorage.setItem(chave, valor); } catch (e) { /* ignora */ }
}
export function lerJson(chave, padrao = null) {
  try { const v = JSON.parse(localStorage.getItem(chave) || "null"); return v === null ? padrao : v; } catch (e) { return padrao; }
}
