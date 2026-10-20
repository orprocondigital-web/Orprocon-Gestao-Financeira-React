// Conciliação em React (src/lib/conciliar.mjs): resultado da tela, grupos manuais e totais. Dados fictícios.
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../src/legado/core.js");
const Conciliacao = require("../src/legado/conciliacao.js");

let C;
before(async () => { C = await import("../src/lib/conciliar.mjs"); });
const E = (data, valorNum, sign, desc) => ({ data, valorNum, sign, desc: desc || "MOV" });
const base = () => ({
  extrato: [E("2026-09-01", 100, "C", "PIX RECEBIDO CLIENTE A"), E("2026-09-02", 50, "D", "TARIFA"), E("2026-09-05", 300, "D", "PAGTO BOLETOS"), E("2026-09-06", 20, "C")],
  sistema: [E("2026-09-01", 100, "C", "Cliente A"), E("2026-09-04", 20, "C", "Juros"), E("2026-09-05", 120, "D", "Boleto 1"), E("2026-09-05", 180, "D", "Boleto 2")]
});
const calc = (x) => C.calcular(Object.assign({ Core, Conciliacao, tolerancia: 3 }, base(), x));

describe("conciliação por conta", () => {
  test("cruza por valor, sinal e data; pendências primeiro", () => {
    const r = calc({});
    assert.deepEqual(r.linhas.map((l) => l.status), ["so_extrato", "so_extrato", "so_sistema", "so_sistema", "data_diferente", "ok"]);
    assert.equal(r.resumo.ok, 1); assert.equal(r.resumo.data_diferente, 1);
    assert.equal(r.pendentes, 4); assert.equal(r.fechado, false);
    const p = r.linhas[0];
    assert.equal(p.lado, "ext"); assert.ok(p.chave);
    assert.equal(r.itemDe("ext", p.chave), p.extrato);
  });
  test("juntar à mão (um débito pagou dois boletos) e marcar tarifa como conferida", () => {
    const r1 = calc({});
    const ch = (desc) => r1.linhas.find((l) => (l.extrato || l.sistema).desc === desc).chave;
    const grupos = [C.grupoManual([ch("PAGTO BOLETOS")], [ch("Boleto 1"), ch("Boleto 2")], "")]
      .concat(C.gruposConferidos([ch("TARIFA")], [], "tarifa bancária"));
    const r = calc({ grupos });
    assert.equal(r.resumo.manual, 1); assert.equal(r.resumo.justificado, 1);
    assert.equal(r.pendentes, 0); assert.equal(r.fechado, true); assert.equal(r.pct, 100);
    const man = r.linhas.find((l) => l.status === "manual");
    assert.equal(man.sistemas.length, 2); assert.equal(man.diferencaCents, 0);
    assert.equal(r.linhas.find((l) => l.status === "justificado").obs, "tarifa bancária");
    assert.equal(r.diferencaCents, -5000, "a tarifa só existe no banco: a diferença continua aparecendo");
  });
  test("a busca filtra os dois lados e as chaves não mudam", () => {
    const todas = calc({});
    const r = calc({ filtro: "boleto" });
    assert.ok(r.linhas.every((l) => /boleto/i.test((l.extrato || l.sistema).desc)));
    const k = r.linhas.find((l) => l.lado === "sis").chave;
    assert.ok(todas.linhas.some((l) => l.chave === k));
  });
  test("tolerância zero: data diferente vira pendência", () => {
    assert.equal(calc({ tolerancia: 0 }).resumo.data_diferente, 0);
    assert.equal(calc({ tolerancia: "x" }).resumo.data_diferente, 0);
  });
  test("soma com sinal da seleção", () => {
    assert.equal(C.somaCents([E("x", 10.1, "C"), E("x", 0.2, "D")]), 990);
  });
  test("prepara o texto do extrato para a busca e lista os meses", () => {
    const [e] = C.prepararExtrato([{ data: "2026-09-01", desc: "PIX", nome: "Fulano", cpf: "123", valorNum: 1, sign: "C" }], "x.ofx");
    assert.equal(e.texto, "PIX Fulano 123"); assert.equal(e.origem, "x.ofx");
    assert.deepEqual(C.mesesDoExtrato([E("2026-10-01"), E("2026-09-30"), E("2026-10-02")]), ["2026-09", "2026-10"]);
  });
});

describe("grupos guardados por conta", () => {
  test("grava na mesma chave da versão HTML e apaga quando fica vazio", () => {
    const d = {};
    const Store = { get: (k) => d[k], set: (k, v) => { d[k] = v; }, remove: (k) => { delete d[k]; } };
    C.salvarGruposDaConta(Store, "banco-1", [{ ext: ["a"], sis: [], tipo: "justificado" }]);
    assert.deepEqual(Object.keys(d), ["conciliacao-manual:banco-1"]);
    assert.equal(C.gruposDaConta(Store, "banco-1").length, 1);
    C.salvarGruposDaConta(Store, "banco-1", []);
    assert.deepEqual(Object.keys(d), []);
    assert.deepEqual(C.gruposDaConta(Store, ""), []);
  });
});
