import { useSyncExternalStore } from "react";
import { criarEmDia } from "./emDia.mjs";

/** Instância única do Em Dia; quem usa o hook se redesenha a cada gravação (e quando outra aba grava). */
let versao = 0;
const ouvintes = new Set();
function avisar() { versao++; ouvintes.forEach((f) => f()); }
const ls = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  setItem: (k, v) => { localStorage.setItem(k, v); },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignora */ } }
};
export const emDia = criarEmDia({ ls, aoMudar: avisar });
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (!e.key || /^(emDia|painelVencimentos):/.test(e.key)) avisar(); });

export function useEmDia() {
  const v = useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => versao);
  return [emDia, v];
}
