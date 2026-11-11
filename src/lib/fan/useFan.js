import { useSyncExternalStore } from "react";
import { configPadrao } from "./regrasFan.mjs";

/*
 * Fan Metal: a configuração (contas, bancos, contratos, listas de fornecedores, funcionários e cheques, regras e o
 * último balancete) fica em "fan:config:v1", que sobe para o servidor como os outros módulos (área fan-metal).
 * O mês (extratos, comprovantes e decisões) fica em /api/conciliacoes com o tipo "fan" (FanMetal.jsx).
 */
const CHAVE = "fan:config:v1";
let versao = 0;
const ouvintes = new Set();
function avisar() { versao++; ouvintes.forEach((f) => f()); }

/** A configuração guardada por cima da padrão (o que for novo na padrão aparece sem apagar o que a pessoa mudou). */
export function normalizarConfig(c) {
  const p = configPadrao();
  if (!c || typeof c !== "object") return p;
  return Object.assign(p, c, {
    contas: Object.assign({}, p.contas, c.contas || {}),
    bancos: Array.isArray(c.bancos) && c.bancos.length ? c.bancos : p.bancos,
    contratosEmprestimo: Array.isArray(c.contratosEmprestimo) ? c.contratosEmprestimo : p.contratosEmprestimo,
    fornecedores: c.fornecedores && typeof c.fornecedores === "object" ? c.fornecedores : {},
    funcionarios: Array.isArray(c.funcionarios) ? c.funcionarios : [],
    cheques: c.cheques && typeof c.cheques === "object" ? c.cheques : {},
    regras: Array.isArray(c.regras) ? c.regras : []
  });
}
function ler() { try { return normalizarConfig(JSON.parse(localStorage.getItem(CHAVE) || "null")); } catch (e) { return configPadrao(); } }
let cfg = ler();
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (!e.key || e.key === CHAVE) { cfg = ler(); avisar(); } });

export const fan = {
  config: () => cfg,
  /** novo: a configuração inteira ou uma função (atual) → nova. */
  gravar(novo) {
    const n = normalizarConfig(typeof novo === "function" ? novo(cfg) : novo);
    try { localStorage.setItem(CHAVE, JSON.stringify(n)); } catch (e) { throw new Error("Não consegui guardar a configuração neste navegador (espaço cheio?)."); }
    cfg = n;
    avisar();
  }
};

export function useFan() {
  const v = useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => versao);
  return [fan.config(), v];
}
