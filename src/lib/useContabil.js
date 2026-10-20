import { useSyncExternalStore } from "react";
import { criarContabil } from "./contabil.mjs";
import { Core, Extratos, Importacao, Integracao, Store } from "./legado.js";

/*
 * Uma instância só da Integração contábil para o sistema inteiro. Cada gravação aumenta a "versão",
 * e quem usa useContabil() se redesenha (menu, competência, telas de conta e cadastro).
 */
let versao = 0;
const ouvintes = new Set();
function avisar() { versao++; ouvintes.forEach((f) => f()); }

const lsSeguro = {   // o navegador pode bloquear o localStorage (modo privado, políticas): não quebra a tela
  getItem: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  setItem: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignora */ } }
};

export const contabil = criarContabil({ Store, ls: lsSeguro, Core, Integracao, Importacao, Extratos, aoMudar: avisar });

function assinar(f) { ouvintes.add(f); return () => ouvintes.delete(f); }

/** [contabil, versão]: a versão muda a cada gravação (use como dependência de useMemo). */
export function useContabil() {
  const v = useSyncExternalStore(assinar, () => versao);
  return [contabil, v];
}

let migrado = false;
/** Dados muito antigos (até a versão 0.4) sem mês: move uma vez por sessão. */
export function migrarUmaVez() {
  if (migrado) return;
  migrado = true;
  contabil.migrarParaCompetencias().catch(() => { migrado = false; });
}
