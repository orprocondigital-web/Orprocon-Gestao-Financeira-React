/*
 * Conciliação avulsa no servidor (/api/conciliacoes). Regras e formato em conciliar.mjs.
 * Sem servidor (CONFIG.apiUrl vazio), a conciliação fica só neste navegador, como antes.
 */
import { CONFIG } from "./legado.js";

export const CONCILIACAO_NO_SERVIDOR = !!CONFIG.apiUrl;

function token() {
  try { const s = JSON.parse(localStorage.getItem("gf.sessao") || "null"); return (s && s.token) || ""; } catch (e) { return ""; }
}

async function chamar(metodo, caminho, corpo) {
  const cab = { Accept: "application/json", Authorization: "Bearer " + token() };
  if (corpo !== undefined) cab["Content-Type"] = "application/json";
  let r;
  try {
    r = await fetch(String(CONFIG.apiUrl).replace(/\/+$/, "") + caminho, { method: metodo, headers: cab, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  } catch (e) { throw Object.assign(new Error("Sem conexão com o servidor."), { codigo: "sem-conexao" }); }
  const texto = await r.text();
  let dado = null;
  try { dado = texto ? JSON.parse(texto) : null; } catch (e) { dado = null; }
  if (!r.ok) throw Object.assign(new Error((dado && (dado.mensagem || dado.message)) || "O servidor respondeu com erro " + r.status + "."), { status: r.status, codigo: dado && dado.erro });
  return dado;
}

/** Lista sem o estado (filtro: { cnpj, competencia }). */
export function listarConciliacoes(filtro = {}) {
  const q = new URLSearchParams();
  if (filtro.cnpj) q.set("cnpj", filtro.cnpj);
  if (filtro.competencia) q.set("competencia", filtro.competencia);
  return chamar("GET", "/api/conciliacoes" + (q.toString() ? "?" + q : ""));
}
/** A conciliação com o estado. */
export const abrirConciliacao = (id) => chamar("GET", "/api/conciliacoes/" + encodeURIComponent(id));
/** pedido: pedidoParaServidor(...) */
export const criarConciliacao = (pedido) => chamar("POST", "/api/conciliacoes", pedido);
/** Erro com codigo "conflito" se outra pessoa salvou antes. */
export const salvarConciliacao = (id, versao, pedido) => chamar("PUT", "/api/conciliacoes/" + encodeURIComponent(id) + "?versao=" + versao, pedido);
export const excluirConciliacao = (id) => chamar("DELETE", "/api/conciliacoes/" + encodeURIComponent(id));
