import { useSyncExternalStore } from "react";
import H from "./horas/dados.mjs";
import R from "./horas/regras.mjs";

/*
 * Controle de horas: o estado em "horas:v1" (o mesmo do módulo antigo, então o que já existe continua),
 * a empresa escolhida em "horas:empresa" e o mês em "horas:mes". Regras em src/lib/horas/.
 */
const CHAVE = "horas:v1";
let versao = 0;
const ouvintes = new Set();
function avisar() { versao++; ouvintes.forEach((f) => f()); }
function ler() { try { return H.normalizar(JSON.parse(localStorage.getItem(CHAVE) || "null")); } catch (e) { return H.estadoVazio(); } }
let estado = ler();
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (!e.key || /^horas:/.test(e.key)) { estado = ler(); avisar(); } });

const lerLocal = (k) => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
const gravarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } };
function mesAnterior() { const d = new Date(); return R.somarMes(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"), -1); }

export const horas = {
  estado: () => estado,
  /** Faz a mudança (uma função que recebe o estado) e grava. Erros sobem com a mensagem das regras. */
  mudar(fn) {
    const r = fn(estado);
    try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) { throw new Error("Não consegui guardar os dados neste navegador (espaço cheio?)."); }
    avisar();
    return r;
  },
  empresas: () => estado.empresas.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  empresaId() {
    const id = lerLocal("horas:empresa");
    if (H.porId(estado.empresas, id)) return id;
    const p = horas.empresas()[0];
    return p ? p.id : "";
  },
  definirEmpresa: (id) => { gravarLocal("horas:empresa", id); avisar(); },
  mes: () => lerLocal("horas:mes") || mesAnterior(),
  definirMes: (m) => { gravarLocal("horas:mes", m); avisar(); }
};

export function useHoras() {
  const v = useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => versao);
  return [horas, v];
}
