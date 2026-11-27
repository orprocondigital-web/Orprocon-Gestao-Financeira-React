/*
 * Calculadora da Receita pela API da Central (/api/reforma). Regras em receitaRtc.mjs.
 * Sem servidor (CONFIG.apiUrl vazio) a conferência com a Receita fica indisponível.
 */
import { CONFIG } from "./legado.js";
import { mensagemErro } from "./receitaRtc.mjs";

export const RECEITA_NO_SERVIDOR = !!CONFIG.apiUrl;

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
  if (!r.ok) {
    const daCentral = dado && dado.erro && dado.mensagem;
    throw Object.assign(new Error(daCentral ? dado.mensagem : mensagemErro(dado || texto)), { status: r.status, codigo: (dado && dado.erro) || "receita-recusou" });
  }
  return dado;
}

/** { versaoApp, versaoDb, dataVersaoDb, descricaoVersaoDb } */
export const versaoReceita = () => chamar("GET", "/api/reforma/versao");
/** operacao: montarOperacao(...).operacao → resposta da Receita (ROC). */
export const calcularNaReceita = (operacao) => chamar("POST", "/api/reforma/calcular", operacao);
