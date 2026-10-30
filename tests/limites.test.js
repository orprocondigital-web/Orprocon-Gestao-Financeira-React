// Limites de faturamento do MEI e do Simples Nacional (valores de 2026). Empresas e valores fictícios.
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

let D;
before(async () => { D = await import("../src/lib/depCadastro.mjs"); });
function amb() {
  const ls = {};
  const svc = D.criarDepCadastro({ ls: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } },
    agora: () => new Date(2026, 9, 20, 10), aoMudar: () => {} });
  return svc;
}

describe("situação diante do limite", () => {
  test("níveis: ok, atenção (80%), acima e mais de 20% acima", () => {
    assert.equal(D.situacaoLimite("MEI", 40000, 2026).nivel, "ok");
    assert.equal(D.situacaoLimite("MEI", 64800, 2026).nivel, "atencao", "80% de 81 mil");
    const acima = D.situacaoLimite("MEI", 90000, 2026);
    assert.equal(acima.nivel, "acima");
    assert.match(acima.consequencia, /janeiro do ano seguinte/);
    const muito = D.situacaoLimite("MEI", 98000, 2026);
    assert.equal(muito.nivel, "excesso20");
    assert.match(muito.consequencia, /início do ano/);
    assert.equal(D.situacaoLimite("SIMPLES", 5800000, 2026).nivel, "excesso20");
    assert.equal(D.situacaoLimite("SUBLIMITE", 3700000, 2026).nivel, "acima");
  });
  test("ano de abertura: limite proporcional aos meses de atividade", () => {
    const s = D.situacaoLimite("MEI", 30000, 2026, { inicioAtividade: "2026-07-15" });
    assert.equal(s.limite, 6750 * 6, "julho a dezembro = 6 meses");
    assert.equal(s.proporcional, true);
    assert.equal(s.nivel, "ok", "30 mil de 40,5 mil = 74%");
    assert.match(s.texto, /proporcional/);
    assert.equal(D.situacaoLimite("SIMPLES", 100000, 2026, { inicioAtividade: "2025-03-01" }).limite, 4800000, "abriu em outro ano: limite cheio");
  });
  test("projeção pelo ritmo do ano avisa antes de chegar a 80%", () => {
    const meses = {};
    ["01", "02", "03", "04", "05", "06", "07", "08", "09"].forEach((m) => { meses[m] = 7000; });   // 63.000 até setembro = 78%
    const s = D.situacaoLimite("MEI", 63000, 2026, { hoje: "2026-10-20", meses });
    assert.equal(s.projecao, 84000);
    assert.equal(s.nivel, "atencao");
    assert.equal(s.mesEstouro, "dezembro");
    assert.match(s.texto, /passa em dezembro/);
    assert.equal(D.situacaoLimite("MEI", 63000, 2025, { hoje: "2026-10-20", meses }).projecao, null, "ano passado não projeta");
  });
});

describe("limites do ano no cadastro", () => {
  test("soma matriz e filiais, ignora Presumido/Real e ordena do mais grave", () => {
    const svc = amb();
    const m = svc.salvarEmpresa({ nome: "Alfa Exemplo", documento: "11.111.111/0001-11", regime: "Simples Nacional" });
    const f = svc.salvarEmpresa({ nome: "Alfa Exemplo (filial)", documento: "11.111.111/0002-00" });
    const mei = svc.salvarEmpresa({ nome: "Beta MEI", documento: "22.222.222/0001-22", regime: "MEI" });
    const pres = svc.salvarEmpresa({ nome: "Gama Presumido", documento: "33.333.333/0001-33", regime: "Lucro Presumido" });
    svc.definirFaturamento("2026", m.id, "01", 2000000);
    svc.definirFaturamento("2026", f.id, "02", 1700000);
    svc.definirFaturamento("2026", mei.id, "03", 85000);
    svc.definirFaturamento("2026", pres.id, "01", 9000000);
    const l = svc.limitesDoAno(2026);
    assert.deepEqual(l.map((x) => x.empresa.nome), ["Beta MEI", "Alfa Exemplo"]);
    assert.equal(l[0].pior.nivel, "acima");
    const alfa = l[1];
    assert.equal(alfa.total, 3700000, "matriz + filial");
    assert.deepEqual(alfa.situacoes.map((s) => [s.tipo, s.nivel]), [["SIMPLES", "atencao"], ["SUBLIMITE", "acima"]]);
    assert.equal(alfa.pior.tipo, "SUBLIMITE");
  });
});
