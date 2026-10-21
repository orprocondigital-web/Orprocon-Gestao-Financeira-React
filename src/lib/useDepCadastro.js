import { useSyncExternalStore } from "react";
import { criarDepCadastro } from "./depCadastro.mjs";

/** Instância única do Departamento Cadastro; quem usa o hook se redesenha a cada gravação. */
let versao = 0;
const ouvintes = new Set();
function avisar() { versao++; ouvintes.forEach((f) => f()); }
const ls = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  setItem: (k, v) => { localStorage.setItem(k, v); }
};
export const depCadastro = criarDepCadastro({ ls, aoMudar: avisar });
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (!e.key || /^(painelVencimentos|depCadastro):/.test(e.key)) avisar(); });

export function useDepCadastro() {
  const v = useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => versao);
  return [depCadastro, v];
}
