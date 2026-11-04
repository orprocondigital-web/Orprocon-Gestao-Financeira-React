/*
 * PDFs anexados aos documentos do Departamento Cadastro (regras em anexos.mjs).
 * Com o servidor ligado (CONFIG.apiUrl): vão para a API (/api/arquivos → Supabase Storage) e abrem de qualquer
 * computador. Sem servidor: ficam num banco próprio do navegador ("gf-arquivos"), separado dos dados.
 * Os PDFs antigos, que só existem neste navegador, sobem uma vez sozinhos (subirAnexosDoNavegador, em main.jsx).
 */
import { CONFIG } from "./legado.js";
import { CHAVE_DOCS } from "./depCadastro.mjs";
import { criarAnexos } from "./anexos.mjs";

const BANCO = "gf-arquivos", LOJA = "pdfs";
let aberto = null;
function abrir() {
  if (aberto) return aberto;
  aberto = new Promise((ok, erro) => {
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(LOJA);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => { aberto = null; erro(r.error); };
  });
  return aberto;
}
function pedido(modo, fn) {
  return abrir().then((db) => new Promise((ok, erro) => {
    const tx = db.transaction(LOJA, modo);
    const r = fn(tx.objectStore(LOJA));
    tx.oncomplete = () => ok(r && r.result);
    tx.onerror = tx.onabort = () => erro(tx.error);
  }));
}
const local = {
  get: (id) => pedido("readonly", (s) => s.get(id)),
  put: (id, a) => pedido("readwrite", (s) => s.put(a, id)),
  del: (id) => pedido("readwrite", (s) => s.delete(id)),
  ids: () => pedido("readonly", (s) => s.getAllKeys())
};

function token() {
  try { const s = JSON.parse(localStorage.getItem("gf.sessao") || "null"); return (s && s.token) || ""; } catch (e) { return ""; }
}
function chamar(metodo, caminho, corpo, cab) {
  return fetch(String(CONFIG.apiUrl).replace(/\/+$/, "") + caminho, {
    method: metodo, body: corpo, headers: Object.assign({ Authorization: "Bearer " + token() }, cab || {})
  });
}
function documentosExistentes() {
  try {
    const e = JSON.parse(localStorage.getItem(CHAVE_DOCS) || "null");
    return new Set(((e && e.documentos) || []).map((d) => d && d.id));
  } catch (err) { return null; }
}

const anexos = criarAnexos({ comServidor: !!CONFIG.apiUrl, chamar, local, documentosExistentes });

/** Guarda o arquivo (Blob/File) do documento (troca o anterior). */
export function guardarArquivo(id, arquivo) { return anexos.guardar(id, arquivo); }
/** Tira o arquivo do documento. */
export function apagarArquivo(id) { return anexos.apagar(id).catch(() => {}); }
/** Limpa os PDFs guardados neste navegador (os do servidor ficam). */
export function apagarTodos() { return pedido("readwrite", (s) => s.clear()).catch(() => {}); }
/** Sobe para o servidor os PDFs que só estão neste navegador (uma vez; com login e servidor ligado). */
export function subirAnexosDoNavegador() {
  if (!CONFIG.apiUrl || !token()) return Promise.resolve({ subiram: 0, falharam: 0, ignorados: 0 });
  return anexos.subirDoNavegador().catch(() => ({ subiram: 0, falharam: 0, ignorados: 0 }));
}
/** Abre o PDF numa aba nova. */
export async function abrirArquivo(id) {
  const aba = window.open("", "_blank");   // abre já (antes da espera), senão o navegador bloqueia como pop-up
  try {
    const a = await anexos.ler(id);
    const url = URL.createObjectURL(a);
    if (aba) aba.location.href = url;
    else { const link = document.createElement("a"); link.href = url; link.target = "_blank"; link.rel = "noopener"; document.body.appendChild(link); link.click(); link.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    if (aba) aba.close();
    throw e;
  }
}
