import { useSyncExternalStore } from "react";
import D from "./iss/dados.mjs";

/*
 * ISS Tubarão: o estado em "iss:v1" (o mesmo do módulo antigo, então o que já foi importado continua) e o
 * mês em "iss:mes". As regras ficam em src/lib/iss/ (leitor do XML e meses importados).
 */
const CHAVE = "iss:v1", CHAVE_MES = "iss:mes";
let versao = 0;
const ouvintes = new Set();
function avisar() { versao++; ouvintes.forEach((f) => f()); }
function ler() { try { return D.normalizar(JSON.parse(localStorage.getItem(CHAVE) || "null")); } catch (e) { return D.estadoVazio(); } }
let estado = ler();
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (!e.key || e.key === CHAVE || e.key === CHAVE_MES) { estado = ler(); avisar(); } });

function mesAnterior() { const d = new Date(); return D.somarMes(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"), -1); }

/** Muda o estado com uma função das regras e grava. Erro de espaço vira mensagem. */
function mudar(fn) {
  const r = fn(estado);
  try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) { throw new Error("Não consegui guardar os dados neste navegador (espaço cheio?)."); }
  avisar();
  return r;
}

export const iss = {
  estado: () => estado,
  mes: () => { try { return localStorage.getItem(CHAVE_MES) || mesAnterior(); } catch (e) { return mesAnterior(); } },
  definirMes: (m) => { try { localStorage.setItem(CHAVE_MES, m); } catch (e) { /* ignora */ } avisar(); },
  importar: (mes, lido, quem) => mudar((e) => D.importar(e, mes, lido, { quem })),
  remover: (mes, chave) => mudar((e) => D.remover(e, mes, chave)),
  marcarConferida: (mes, chave, sim) => mudar((e) => D.marcarConferida(e, mes, chave, sim)),
  exemplo: (mes) => mudar((e) => D.exemplo(e, mes)),
  removerExemplo: () => mudar((e) => D.removerExemplo(e)),
  limparTudo: () => mudar((e) => D.limparTudo(e))
};

export function useIss() {
  const v = useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => versao);
  return [iss, v];
}
