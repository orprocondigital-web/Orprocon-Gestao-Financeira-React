import { useSyncExternalStore } from "react";
import { criarLucros } from "./lucros.mjs";

/** Instância única de Distribuição de lucros e REINF; quem usa o hook se redesenha a cada gravação. */
let versao = 0;
const ouvintes = new Set();
function avisar() { versao++; ouvintes.forEach((f) => f()); }
const ls = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  setItem: (k, v) => { localStorage.setItem(k, v); }
};
export const lucros = criarLucros({ ls, aoMudar: avisar });
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (!e.key || /^(lucros|painelVencimentos):/.test(e.key)) avisar(); });

export function useLucros() {
  const v = useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => versao);
  return [lucros, v];
}
