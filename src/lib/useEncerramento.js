import { useSyncExternalStore } from "react";
import { criarEncerramento } from "./encerramento.mjs";

/** Instância única do Encerramento contábil; quem usa o hook se redesenha a cada gravação. */
let versao = 0;
const ouvintes = new Set();
function avisar() { versao++; ouvintes.forEach((f) => f()); }
const ls = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  setItem: (k, v) => { localStorage.setItem(k, v); }
};
export const encerramento = criarEncerramento({ ls, aoMudar: avisar });
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (!e.key || /^(encerramento|painelVencimentos):/.test(e.key)) avisar(); });

export function useEncerramento() {
  const v = useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => versao);
  return [encerramento, v];
}
