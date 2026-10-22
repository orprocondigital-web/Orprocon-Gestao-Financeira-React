// Encerramento contábil do exercício (src/lib/encerramento.mjs). Empresas fictícias.
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

let E;
before(async () => { E = await import("../src/lib/encerramento.mjs"); });
function amb() {
  const ls = { "painelVencimentos:v1": JSON.stringify({ clientes: [
    { id: "m1", nome: "Alfa Exemplo Ltda", documento: "11.111.111/0001-11", regime: "Lucro Presumido" },
    { id: "f1", nome: "Alfa Exemplo (filial)", documento: "11.111.111/0002-92" },
    { id: "m2", nome: "Beta Exemplo ME", documento: "22.222.222/0001-22", regime: "Simples Nacional" },
    { id: "m3", nome: "Gama Antiga", documento: "33.333.333/0001-33", saida: "2025-06" },
    { id: "f9", nome: "Filial sem matriz", documento: "44.444.444/0002-44" }
  ], documentos: [] }) };
  let n = 0;
  const svc = E.criarEncerramento({ ls: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } },
    agora: () => new Date(2026, 9, 22, 10), aoMudar: () => n++ });
  return { svc, ls, mudancas: () => n };
}

describe("cálculos", () => {
  test("CMV, lucro bruto, % e resultado do período sugerido", () => {
    const c = E.calcular({ estoqueInicial: 100, compras: 500, estoqueFinal: 150, receitaBruta: 1000, resultadoAntesEstoque: 80 });
    assert.deepEqual([c.cmv, c.lucroBruto, c.pct, c.resultadoSugerido, c.resultado, c.resultadoInformado], [450, 550, 55, 130, 130, false]);
    const i = E.calcular({ estoqueInicial: 100, compras: 500, estoqueFinal: 150, receitaBruta: 1000, resultadoAntesEstoque: 80, resultadoPeriodo: 120 });
    assert.deepEqual([i.resultado, i.resultadoInformado], [120, true]);
    assert.deepEqual(E.calcular({}), { cmv: null, lucroBruto: null, pct: null, resultadoSugerido: null, resultado: null, resultadoInformado: false });
    assert.equal(E.calcular({ estoqueInicial: 0, compras: 0, estoqueFinal: 0, receitaBruta: 0 }).pct, null, "sem receita não há %");
    assert.equal(E.completa({ estoqueInicial: 0, compras: 0, estoqueFinal: 0, receitaBruta: 0 }), true, "zero conta como informado");
    assert.equal(E.completa({ estoqueInicial: 1, compras: 1, estoqueFinal: 1 }), false);
  });
});

describe("grupos, consolidado e status", () => {
  test("matriz com filiais, filial sem matriz vira grupo, empresa fora do ano some", () => {
    const { svc } = amb();
    assert.equal(svc.anoPadrao(), "2026");
    const g = svc.grupos("2026");
    assert.deepEqual(g.grupos.map((x) => x.matriz.id), ["m1", "m2", "f9"]);
    assert.deepEqual(g.grupos[0].unidades.map((u) => [u.empresa.id, u.filial]), [["m1", false], ["f1", true]]);
    assert.deepEqual(svc.grupos("2025").grupos.map((x) => x.matriz.id).sort(), ["f9", "m1", "m2", "m3"], "a Gama ainda era cliente em 2025");
    assert.deepEqual([g.total, g.encerrados, g.pendentes, g.pct], [3, 0, 3, 0]);
  });
  test("salva por unidade, consolida e só encerra completo", () => {
    const { svc } = amb();
    assert.throws(() => svc.salvar("m1", "2026", { compras: "abc" }), /inválido/);
    assert.throws(() => svc.salvar("m1", "2026", { estoqueFinal: -5 }), /negativo/);
    svc.salvar("m1", "2026", { estoqueInicial: 100, compras: 500, estoqueFinal: 150, receitaBruta: 1000, resultadoAntesEstoque: 80 });
    assert.throws(() => svc.encerrar("m1", "2026", true, "Ana"), /filial/);
    svc.salvar("f1", "2026", { estoqueInicial: 10, compras: 50, estoqueFinal: 20, receitaBruta: 200, resultadoPeriodo: 40 });
    const g = svc.grupos("2026").grupos[0];
    assert.equal(g.prontaParaEncerrar, true);
    assert.deepEqual(g.consolidado.dados, { estoqueInicial: 110, compras: 550, estoqueFinal: 170, receitaBruta: 1200, resultadoAntesEstoque: 80, resultadoPeriodo: 170 });
    assert.deepEqual([g.consolidado.calc.cmv, g.consolidado.calc.lucroBruto, g.consolidado.calc.pct], [490, 710, 59.2]);
    svc.encerrar("m1", "2026", true, "Ana");
    const r = svc.grupos("2026");
    assert.deepEqual([r.grupos[0].status, r.grupos[0].por, r.encerrados, r.pct], ["encerrado", "Ana", 1, 33]);
    assert.deepEqual(svc.grupos("2026", { status: "pendente" }).grupos.map((x) => x.matriz.id), ["m2", "f9"]);
    assert.deepEqual(svc.grupos("2026", { busca: "filial" }).grupos.map((x) => x.matriz.id), ["m1", "f9"], "busca acha pela filial");
    assert.deepEqual(svc.grupos("2026", { busca: "22.222" }).grupos.map((x) => x.matriz.id), ["m2"]);
    assert.deepEqual(svc.grupos("2026", { regime: "Simples Nacional" }).grupos.map((x) => x.matriz.id), ["m2"]);
    svc.encerrar("m1", "2026", false);
    assert.equal(svc.grupos("2026").grupos[0].status, "pendente");
    assert.equal(svc.grupos("2025").grupos.find((x) => x.matriz.id === "m1").unidades[0].completa, false, "cada ano tem os seus números");
  });
  test("demonstração só quando vazio, e limpar desfaz", () => {
    const { svc } = amb();
    assert.ok(svc.carregarDemonstracao("2026"));
    assert.equal(svc.carregarDemonstracao("2026"), false);
    const g = svc.grupos("2026");
    assert.equal(g.encerrados, 1);
    assert.ok(g.grupos.some((x) => !x.unidades[0].completa), "um grupo fica pendente sem números");
    const des = svc.limpar();
    assert.equal(svc.grupos("2026").encerrados, 0);
    des();
    assert.equal(svc.grupos("2026").encerrados, 1);
  });
});
