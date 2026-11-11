// Dados dos módulos no servidor (src/lib/sincronizar.mjs): navegador ↔ /api/modulos, com versão.
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

let S;
before(async () => { S = await import("../src/lib/sincronizar.mjs"); });

/** Navegador e servidor de mentira. O servidor guarda { valor (texto), versao } por chave. */
function amb(local = {}, servidor = {}, opcoes = {}) {
  const ls = Object.assign({}, local);
  const srv = {};
  Object.keys(servidor).forEach((k) => { srv[k] = { valor: JSON.stringify(servidor[k]), versao: 1 }; });
  const chamadas = [], eventos = [], agendados = [];
  let offline = false;
  const storage = { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; }, keys: () => Object.keys(ls) };
  async function chamar(metodo, caminho, corpo) {
    chamadas.push({ metodo, caminho, corpo });
    if (offline) throw new Error("sem rede");
    if (caminho.startsWith("/api/modulos?valores=true")) {
      return { ok: true, status: 200, dado: Object.keys(srv).map((k) => ({ chave: k, versao: srv[k].versao, valor: JSON.parse(srv[k].valor) })) };
    }
    if (caminho === "/api/modulos") return { ok: true, status: 200, dado: Object.keys(srv).map((k) => ({ chave: k, versao: srv[k].versao })) };
    const m = /^\/api\/modulos\/([^?]+)\?versao=(\d+)$/.exec(caminho);
    const k = decodeURIComponent(m[1]), v = Number(m[2]);
    const atual = srv[k] ? srv[k].versao : 0;
    if (opcoes.proibidas && opcoes.proibidas.includes(k)) return { ok: false, status: 403, dado: { erro: "sem-acesso-area" } };
    if (v !== atual) return { ok: false, status: 409, dado: { erro: "conflito" } };
    if (metodo === "DELETE") { delete srv[k]; return { ok: true, status: 204, dado: null }; }
    srv[k] = { valor: corpo, versao: atual + 1 };
    return { ok: true, status: 200, dado: { chave: k, versao: atual + 1 } };
  }
  const sinc = S.criarSincronizador({ storage, chamar, avisar: (e) => eventos.push(e), agendar: (fn) => { agendados.push(fn); return fn; },
    cancelar: (fn) => { const i = agendados.indexOf(fn); if (i > -1) agendados.splice(i, 1); } });
  const rodarAgendados = async (max = 50) => { while (agendados.length && max-- > 0) { agendados.shift()(); await new Promise((r) => setTimeout(r, 0)); } };
  return { sinc, ls, srv, chamadas, eventos, agendados, rodarAgendados, ficarOffline: (x) => { offline = x; } };
}

describe("quais chaves vão para o servidor", () => {
  test("só as dos módulos, e só objetos ou listas em JSON", () => {
    assert.ok(S.chaveDoServidor("painelVencimentos:v1"));
    assert.ok(S.chaveDoServidor("emDia:v2"));
    assert.ok(S.chaveDoServidor("fan:config:v1"), "a configuração da Fan Metal sobe para o servidor");
    assert.ok(!S.chaveDoServidor("gf.fan.mes.2026-09"), "o mês da Fan vai por /api/conciliacoes, não pelos módulos");
    assert.ok(S.chaveDoServidor("icms.aj.12345678000199.2026-08"));
    assert.ok(!S.chaveDoServidor("gf.sessao"));
    assert.ok(!S.chaveDoServidor("auth:usuarios"));
    assert.ok(!S.chaveDoServidor("emDia:"));
    assert.ok(S.ehDado('{"clientes":[]}') && S.ehDado("[]"));
    assert.ok(!S.ehDado("2026-10") && !S.ehDado('"equipe"') && !S.ehDado("null") && !S.ehDado(""));
  });
});

describe("ao abrir: servidor → navegador", () => {
  test("o que está no servidor vale e o navegador guarda a versão", async () => {
    const { sinc, ls } = amb({ "emDia:v2": '{"velho":true}' }, { "emDia:v2": { novo: true }, "iss:v1": { empresas: [] } });
    const r = await sinc.baixar();
    assert.deepEqual(r.mudou.sort(), ["emDia:v2", "iss:v1"]);
    assert.equal(ls["emDia:v2"], '{"novo":true}');
    assert.deepEqual(sinc.versoes(), { "emDia:v2": 1, "iss:v1": 1 });
    const de_novo = await sinc.baixar();
    assert.deepEqual(de_novo.mudou, [], "abrir de novo não muda nada");
  });

  test("a primeira vez de quem já tinha dados: sobe o que só existe no navegador (preferências ficam)", async () => {
    const painel = JSON.stringify({ clientes: [{ id: "c1", nome: "Celesp" }], documentos: [] });
    const { sinc, srv } = amb({ "painelVencimentos:v1": painel, "iss:mes": "2026-10", "tema": "dark", "gf.sessao": "{}" });
    const r = await sinc.baixar();
    assert.deepEqual(r.subiu, ["painelVencimentos:v1"]);
    assert.equal(srv["painelVencimentos:v1"].valor, painel);
    assert.equal(sinc.versoes()["painelVencimentos:v1"], 1);
    assert.ok(!srv["iss:mes"] && !srv["tema"]);
  });

  test("o que outra pessoa apagou no servidor sai do navegador", async () => {
    const { sinc, ls, srv } = amb({}, { "lucros:v1": { a: 1 } });
    await sinc.baixar();
    delete srv["lucros:v1"];
    const r = await sinc.baixar();
    assert.deepEqual(r.mudou, ["lucros:v1"]);
    assert.ok(!("lucros:v1" in ls));
  });
});

describe("ao gravar: navegador → servidor", () => {
  test("manda com a versão que leu e guarda a nova", async () => {
    const { sinc, ls, srv, eventos, rodarAgendados } = amb({}, { "emDia:v2": { a: 1 } });
    await sinc.baixar();
    ls["emDia:v2"] = '{"a":2}'; sinc.marcar("emDia:v2");
    ls["emDia:v2"] = '{"a":3}'; sinc.marcar("emDia:v2");
    await rodarAgendados();
    assert.equal(srv["emDia:v2"].valor, '{"a":3}');
    assert.equal(sinc.versoes()["emDia:v2"], 2);
    assert.ok(eventos.some((e) => e.tipo === "salvo"));
    assert.equal(sinc.pendentes(), 0);
  });

  test("outra pessoa salvou antes: conflito, nada é sobrescrito", async () => {
    const { sinc, ls, srv, eventos, rodarAgendados } = amb({}, { "emDia:v2": { a: 1 } });
    await sinc.baixar();
    srv["emDia:v2"] = { valor: '{"a":"da Ana"}', versao: 2 };   // a Ana salvou enquanto isso
    ls["emDia:v2"] = '{"a":"meu"}'; sinc.marcar("emDia:v2");
    await rodarAgendados();
    assert.equal(srv["emDia:v2"].valor, '{"a":"da Ana"}');
    assert.equal(eventos.at(-1).tipo, "conflito");
    assert.deepEqual(await sinc.verificar(), ["emDia:v2"], "e a tela avisa que há novidade");
  });

  test("sem conexão: avisa e tenta de novo", async () => {
    const { sinc, ls, srv, eventos, agendados, rodarAgendados, ficarOffline } = amb();
    await sinc.baixar();
    ficarOffline(true);
    ls["horas:v1"] = '{"empresas":[]}'; sinc.marcar("horas:v1");
    await rodarAgendados(1);                       // o envio: falha e agenda outra tentativa
    assert.ok(eventos.some((e) => e.tipo === "erro"));
    assert.equal(agendados.length, 1, "a nova tentativa ficou agendada");
    assert.equal(sinc.pendentes(), 1);
    ficarOffline(false);
    await rodarAgendados(1);                       // a nova tentativa, agora com conexão
    assert.equal(srv["horas:v1"].valor, '{"empresas":[]}');
    assert.equal(sinc.pendentes(), 0);
  });

  test("apagar no navegador apaga no servidor; sem permissão fica só no navegador", async () => {
    const { sinc, ls, srv, eventos, rodarAgendados } = amb({}, { "iss:v1": { a: 1 } }, { proibidas: ["lucros:v1"] });
    await sinc.baixar();
    delete ls["iss:v1"]; sinc.marcar("iss:v1");
    ls["lucros:v1"] = "{}"; sinc.marcar("lucros:v1");
    await rodarAgendados();
    assert.ok(!srv["iss:v1"]);
    assert.ok(eventos.some((e) => e.tipo === "recusado" && e.chave === "lucros:v1"));
    assert.ok(!srv["lucros:v1"]);
  });

  test("preferência de tela não vai para o servidor", async () => {
    const { sinc, ls, chamadas, rodarAgendados } = amb();
    await sinc.baixar();
    const antes = chamadas.length;
    ls["iss:mes"] = "2026-10"; sinc.marcar("iss:mes");
    ls["tema"] = "dark"; sinc.marcar("tema");
    await rodarAgendados();
    assert.equal(chamadas.length, antes);
  });
});
