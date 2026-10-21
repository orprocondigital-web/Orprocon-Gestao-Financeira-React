/*
 * PDFs anexados aos documentos do Departamento Cadastro. Ficam num banco próprio do navegador
 * ("gf-arquivos"), separado dos dados: não pesam na abertura do sistema e não vão no backup em JSON.
 */
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
/** Guarda o arquivo (Blob/File) com a chave do documento. */
export function guardarArquivo(id, arquivo) { return pedido("readwrite", (s) => s.put(arquivo, id)); }
export function lerArquivo(id) { return pedido("readonly", (s) => s.get(id)); }
export function apagarArquivo(id) { return pedido("readwrite", (s) => s.delete(id)).catch(() => {}); }
export function apagarTodos() { return pedido("readwrite", (s) => s.clear()).catch(() => {}); }
/** Abre o PDF numa aba nova. */
export async function abrirArquivo(id) {
  const a = await lerArquivo(id);
  if (!a) throw new Error("O PDF não está neste computador (os anexos ficam no navegador onde foram importados).");
  const url = URL.createObjectURL(a);
  const link = document.createElement("a");
  link.href = url; link.target = "_blank"; link.rel = "noopener";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
