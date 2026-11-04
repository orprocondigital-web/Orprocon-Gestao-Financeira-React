// PDFs anexados (src/lib/anexos.mjs): servidor de mentira e "banco do navegador" em memória.
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

let A;
before(async () => { A = await import("../src/lib/anexos.mjs"); });

function arquivo(nome, conteudo) { return { name: nome, type: "application/pdf", conteudo }; }
function memoria(inicial) {
  const m = new Map(Object.entries(inicial || {}));
  return { m, get: async (id) => m.get(id) || null, put: async (id, a) => { m.set(id, a); }, del: async (id) => { m.delete(id); }, ids: async () => Array.from(m.keys()) };
}
function servidor({ semArea, fora } = {}) {
  const guardados = new Map(), pedidos = [];
  const resp = (status, corpo) => ({ ok: status < 300, status, blob: async () => corpo, json: async () => (typeof corpo === "object" ? corpo : {}) });
  const chamar = async (metodo, caminho, corpo, cab) => {
    pedidos.push(metodo + " " + caminho);
    if (fora) throw new Error("rede");
    if (semArea) return resp(403, { mensagem: "Você não tem acesso a esta parte do sistema." });
    const id = decodeURIComponent(caminho.replace(/^\/api\/arquivos\//, "").replace(/\?.*$/, ""));
    if (metodo === "POST") { guardados.set(id, { corpo, tipo: cab["Content-Type"], nome: decodeURIComponent((/nome=([^&]*)/.exec(caminho) || [])[1] || "") }); return resp(201, {}); }
    if (metodo === "GET") return guardados.has(id) ? resp(200, guardados.get(id).corpo) : resp(404, { mensagem: "sem anexo" });
    if (metodo === "DELETE") { guardados.delete(id); return resp(204); }
    return resp(400);
  };
  return { chamar, guardados, pedidos };
}

describe("com servidor", () => {
  test("guarda no servidor e abre de qualquer computador", async () => {
    const s = servidor(), aqui = memoria(), outro = memoria();
    const a = A.criarAnexos({ comServidor: true, chamar: s.chamar, local: aqui });
    await a.guardar("doc-1", arquivo("CND Federal.pdf", "PDF1"));
    assert.equal(s.guardados.get("doc-1").nome, "CND Federal.pdf");
    assert.equal(s.guardados.get("doc-1").tipo, "application/pdf");
    assert.equal(aqui.m.size, 0);
    const b = A.criarAnexos({ comServidor: true, chamar: s.chamar, local: outro });
    assert.equal((await b.ler("doc-1")).conteudo, "PDF1");
  });
  test("PDF antigo, só neste navegador: abre daqui e já sobe para o servidor", async () => {
    const s = servidor(), aqui = memoria({ "doc-9": arquivo("alvara.pdf", "ANTIGO") });
    const a = A.criarAnexos({ comServidor: true, chamar: s.chamar, local: aqui });
    assert.equal((await a.ler("doc-9")).conteudo, "ANTIGO");
    await new Promise((ok) => setTimeout(ok, 0));
    assert.equal(s.guardados.get("doc-9").corpo.conteudo, "ANTIGO");
  });
  test("sem o PDF em lugar nenhum, sem conexão e sem acesso: mensagens claras", async () => {
    const vazio = A.criarAnexos({ comServidor: true, chamar: servidor().chamar, local: memoria() });
    await assert.rejects(vazio.ler("doc-x"), /não está no servidor/);
    const fora = A.criarAnexos({ comServidor: true, chamar: servidor({ fora: true }).chamar, local: memoria() });
    await assert.rejects(fora.ler("doc-x"), /Sem conexão/);
    await assert.rejects(fora.guardar("doc-x", arquivo("a.pdf", "1")), /Sem conexão/);
    const sem = A.criarAnexos({ comServidor: true, chamar: servidor({ semArea: true }).chamar, local: memoria() });
    await assert.rejects(sem.guardar("doc-x", arquivo("a.pdf", "1")), /não tem acesso/);
  });
  test("apagar tira do servidor e do navegador", async () => {
    const s = servidor(), aqui = memoria({ "doc-1": arquivo("a.pdf", "x") });
    const a = A.criarAnexos({ comServidor: true, chamar: s.chamar, local: aqui });
    await a.guardar("doc-1", arquivo("a.pdf", "x"));
    await a.apagar("doc-1");
    assert.equal(s.guardados.size, 0); assert.equal(aqui.m.size, 0);
  });
  test("subir do navegador: uma vez, só de documentos que ainda existem", async () => {
    const s = servidor();
    const aqui = memoria({ "doc-1": arquivo("a.pdf", "1"), "doc-2": arquivo("b.pdf", "2"), "doc-apagado": arquivo("c.pdf", "3") });
    const a = A.criarAnexos({ comServidor: true, chamar: s.chamar, local: aqui, documentosExistentes: () => new Set(["doc-1", "doc-2"]) });
    assert.deepEqual(await a.subirDoNavegador(), { subiram: 2, falharam: 0, ignorados: 1 });
    assert.deepEqual(Array.from(s.guardados.keys()).sort(), ["doc-1", "doc-2"]);
    assert.equal(aqui.m.size, 0);
    assert.deepEqual(await a.subirDoNavegador(), { subiram: 0, falharam: 0, ignorados: 0 });
  });
  test("subir do navegador sem acesso ou sem conexão: não apaga nada daqui", async () => {
    const aqui = memoria({ "doc-1": arquivo("a.pdf", "1") });
    const sem = A.criarAnexos({ comServidor: true, chamar: servidor({ semArea: true }).chamar, local: aqui });
    assert.deepEqual(await sem.subirDoNavegador(), { subiram: 0, falharam: 0, ignorados: 0 });
    const fora = A.criarAnexos({ comServidor: true, chamar: servidor({ fora: true }).chamar, local: aqui });
    assert.deepEqual(await fora.subirDoNavegador(), { subiram: 0, falharam: 1, ignorados: 0 });
    assert.equal(aqui.m.size, 1);
  });
});

describe("sem servidor", () => {
  test("continua tudo no navegador", async () => {
    const aqui = memoria(), s = servidor();
    const a = A.criarAnexos({ comServidor: false, chamar: s.chamar, local: aqui });
    await a.guardar("doc-1", arquivo("a.pdf", "x"));
    assert.equal((await a.ler("doc-1")).conteudo, "x");
    await a.apagar("doc-1");
    await assert.rejects(a.ler("doc-1"), /não está neste computador/);
    assert.equal(s.pedidos.length, 0);
  });
});
