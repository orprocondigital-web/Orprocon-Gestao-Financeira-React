/*
 * Liga o sincronizador (sincronizar.mjs) ao navegador: o localStorage de verdade, o fetch com o token do login
 * e um evento "gf-sinc" para a tela mostrar o que está acontecendo (AvisoSincronizacao.jsx).
 * Sem CONFIG.apiUrl (modo sem servidor), nada disto liga e o sistema fica só no navegador, como antes.
 */
import { CONFIG } from "./legado.js";
import { criarSincronizador } from "./sincronizar.mjs";

const proto = typeof Storage !== "undefined" ? Storage.prototype : null;
const original = proto ? { getItem: proto.getItem, setItem: proto.setItem, removeItem: proto.removeItem } : null;

/** localStorage sem a escuta: o que o sincronizador grava aqui não volta para o servidor. */
const bruto = {
  getItem: (k) => original.getItem.call(localStorage, k),
  setItem: (k, v) => original.setItem.call(localStorage, k, v),
  removeItem: (k) => original.removeItem.call(localStorage, k),
  keys: () => Object.keys(localStorage)
};

function token() {
  try { const s = JSON.parse(bruto.getItem("gf.sessao") || "null"); return (s && s.token) || ""; } catch (e) { return ""; }
}

async function chamar(metodo, caminho, corpo) {
  const cab = { Accept: "application/json", Authorization: "Bearer " + token() };
  if (corpo !== undefined) cab["Content-Type"] = "application/json";
  const r = await fetch(String(CONFIG.apiUrl).replace(/\/+$/, "") + caminho, { method: metodo, headers: cab, body: corpo });
  const texto = await r.text();
  let dado = null;
  try { dado = texto ? JSON.parse(texto) : null; } catch (e) { dado = null; }
  return { ok: r.ok, status: r.status, dado };
}

/** Com o servidor ligado os dados são de todos: demonstrações e exemplos (dados fictícios) ficam desligados. */
export const DEMO_LIBERADA = !CONFIG.apiUrl;
/** Os dados dos módulos ficam no servidor (com API) ou só neste navegador (sem API)? */
export const COM_SERVIDOR = !!CONFIG.apiUrl;

export const sinc = CONFIG.apiUrl && original
  ? criarSincronizador({ storage: bruto, chamar, avisar: (e) => window.dispatchEvent(new CustomEvent("gf-sinc", { detail: e })) })
  : null;

let ligado = false;

/** Passa a mandar para o servidor tudo o que os módulos gravarem no localStorage. */
function ligar() {
  if (!sinc || ligado) return;
  ligado = true;
  proto.setItem = function (k, v) { original.setItem.call(this, k, v); if (this === localStorage) sinc.marcar(k); };
  proto.removeItem = function (k) { original.removeItem.call(this, k); if (this === localStorage) sinc.marcar(k); };
  window.addEventListener("beforeunload", (e) => {
    if (!sinc.pendentes()) return;
    sinc.enviarJa();
    e.preventDefault();
    e.returnValue = "";
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sinc.verificar(); });
}

/**
 * Com login feito: traz os dados do servidor para o navegador e liga o envio. Devolve { mudou, subiu }.
 * Sem login ou sem servidor: não faz nada. Se o servidor não responder em até 90 s (plano gratuito acordando),
 * segue com o que está no navegador e avisa.
 */
export async function iniciarSincronizacao() {
  if (!sinc || !token()) return { mudou: [], subiu: [] };
  try {
    const r = await Promise.race([
      sinc.baixar(),
      new Promise((_, nao) => setTimeout(() => nao(new Error("O servidor demorou para responder.")), 90000))
    ]);
    ligar();
    return r;
  } catch (e) {
    ligar();
    window.dispatchEvent(new CustomEvent("gf-sinc", { detail: { tipo: "erro-inicio", mensagem: e.message } }));
    return { mudou: [], subiu: [], erro: e.message };
  }
}

/** Baixa de novo e recarrega a tela (botão "Atualizar" do aviso). */
export function atualizarDoServidor() {
  if (!sinc) return;
  sinc.baixar().catch(() => {}).then(() => window.location.reload());
}
