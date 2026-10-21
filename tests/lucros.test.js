// Distribuição de lucros e REINF (src/lib/lucros.mjs). Empresas e sócios fictícios.
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

let L;
before(async () => { L = await import("../src/lib/lucros.mjs"); });
function amb(extra) {
  const ls = Object.assign({ "painelVencimentos:v1": JSON.stringify({ clientes: [
    { id: "m1", nome: "Alfa Exemplo Ltda", documento: "11.111.111/0001-11", regime: "Lucro Presumido",
      socios: [{ nome: "Sócio A", percentual: 60 }, { nome: "Sócia B", percentual: 40 }] },
    { id: "f1", nome: "Alfa Exemplo (filial)", documento: "11.111.111/0002-92" },
    { id: "m2", nome: "Beta Exemplo ME", documento: "22.222.222/0001-22", saida: "2026-08", socios: [{ nome: "Sócio C", percentual: 100 }] }
  ], documentos: [] }) }, extra);
  let n = 0;
  const svc = L.criarLucros({ ls: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } },
    agora: () => new Date(2026, 9, 21, 10), aoMudar: () => n++ });
  return { svc, ls, mudancas: () => n };
}

describe("cálculo e prazos", () => {
  test("líquido → base = líquido ÷ 90 × 100 e IRRF 10%; bruto → líquido 90%; sem retenção", () => {
    assert.deepEqual(L.calcular(90000, "liquido", true), { base: 100000, irrf: 10000, liquido: 90000 });
    assert.deepEqual(L.calcular(60000, "bruto", true), { base: 60000, irrf: 6000, liquido: 54000 });
    assert.deepEqual(L.calcular(1000, "liquido", false), { base: 1000, irrf: 0, liquido: 1000 });
    assert.deepEqual(L.calcular(1000, "liquido", true), { base: 1111.11, irrf: 111.11, liquido: 1000 });
  });
  test("DARF dia 20 do mês seguinte e REINF dia 15, antecipando fim de semana", () => {
    assert.equal(L.prazoDarf("2026-10-05"), "2026-11-20");
    assert.equal(L.prazoDarf("2026-08-31"), "2026-09-18", "20/09/2026 é domingo");
    assert.equal(L.prazoDarf("2026-12-10"), "2027-01-20");
    assert.equal(L.prazoReinf("2026-09"), "2026-10-15");
    assert.equal(L.prazoReinf("2026-10"), "2026-11-13", "15/11/2026 é domingo");
  });
});

describe("distribuições", () => {
  test("registra, valida, lista e totaliza; empresas são as matrizes com os sócios", () => {
    const { svc } = amb();
    assert.deepEqual(svc.empresas().map((c) => c.id), ["m1", "m2"], "a filial distribui pela matriz");
    assert.equal(svc.empresas()[0].filiais, 1);
    assert.deepEqual(svc.empresas("2026-09").map((c) => c.id), ["m1"], "Beta saiu em agosto");
    assert.throws(() => svc.salvar({ empresaId: "m1", socio: "Sócio A", data: "2026-10-05" }), /valor/);
    assert.throws(() => svc.salvar({ empresaId: "m1", socio: "Sócio A", data: "2026-10-05", valor: 10, retencao: true, ata: true }), /ata/);
    const a = svc.salvar({ empresaId: "m1", socio: "Sócio A", data: "2026-10-05", valor: 90000, modo: "liquido", retencao: true });
    assert.deepEqual([a.base, a.irrf, a.liquido, a.compReinf], [100000, 10000, 90000, "2026-10"]);
    svc.salvar({ empresaId: "m1", socio: "Sócia B", data: "2025-12-20", valor: 5000 });
    const h = svc.historico({ ano: 2026 });
    assert.equal(h.lista.length, 1); assert.equal(h.lista[0].empresa, "Alfa Exemplo Ltda");
    assert.deepEqual(h.totais, { distribuido: 90000, irrf: 10000, base: 100000, qtd: 1, comRetencao: 1 });
    assert.equal(svc.historico({ busca: "sócia" }).lista.length, 1);
    assert.deepEqual(svc.porSocio(2026).map((s) => [s.socio, s.irrf]), [["Sócio A", 10000]]);
    const des = svc.excluir(a.id);
    assert.equal(svc.historico({ ano: 2026 }).lista.length, 0);
    des();
    assert.equal(svc.historico({ ano: 2026 }).lista.length, 1);
  });
  test("sugere retenção quando o mês passa de R$ 50 mil para o mesmo sócio", () => {
    const { svc } = amb();
    svc.salvar({ empresaId: "m1", socio: "Sócio A", data: "2026-10-01", valor: 30000 });
    assert.equal(svc.sugerirRetencao("m1", "Sócio A", "2026-10-25", 20000).reter, false, "50 mil exatos não retém");
    const s = svc.sugerirRetencao("m1", "sócio a", "2026-10-25", 20001);
    assert.deepEqual([s.antes, s.reter], [30000, true]);
    assert.equal(svc.sugerirRetencao("m1", "Sócio A", "2026-11-02", 20001).reter, false, "outro mês");
    assert.equal(svc.sugerirRetencao("m1", "Sócia B", "2026-10-25", 20001).reter, false, "outro sócio");
  });
  test("saldo de ata: aprovado menos o já distribuído; não deixa passar", () => {
    const { svc } = amb();
    svc.definirSaldoAta("m1", 50000);
    svc.salvar({ empresaId: "m1", socio: "Sócio A", data: "2026-03-10", valor: 30000, ata: true });
    assert.deepEqual(svc.saldoAta("m1"), { inicial: 50000, usado: 30000, saldo: 20000 });
    assert.throws(() => svc.salvar({ empresaId: "m1", socio: "Sócia B", data: "2026-03-10", valor: 25000, ata: true }), /saldo de ata/);
    assert.equal(svc.sugerirRetencao("m1", "Sócio A", "2026-03-20", 45000).antes, 0, "ata não conta no limite do mês");
    assert.throws(() => svc.definirSaldoAta("m1", -1), /negativo/);
  });
});

describe("REINF", () => {
  test("empresas da competência, distribuído, notas, confirmação e prazo", () => {
    const { svc } = amb();
    svc.salvar({ empresaId: "m1", socio: "Sócio A", data: "2026-09-10", valor: 90000, retencao: true });
    svc.salvar({ empresaId: "m1", socio: "Sócia B", data: "2026-10-02", valor: 1000, compReinf: "2026-09" });
    const r = svc.reinf("2026-09");
    assert.equal(r.prazo, "2026-10-15");
    assert.deepEqual(r.linhas.map((l) => l.empresa.id), ["m1"]);
    assert.deepEqual(r.linhas[0].distribuido, { liquido: 91000, irrf: 10000, qtd: 2 });
    svc.definirNotas("2026-09", "m1", "7");
    svc.confirmar("2026-09", "m1", true);
    const r2 = svc.reinf("2026-09");
    assert.deepEqual([r2.linhas[0].notas, r2.linhas[0].confirmado, r2.confirmadas, r2.pendentes], [7, true, 1, 0]);
    assert.equal(svc.reinf("2026-08").total, 2, "em agosto a Beta ainda era cliente");
    assert.throws(() => svc.definirNotas("2026-09", "m1", "-2"), /inválida/);
    svc.definirPrazo("2026-09", "2026-10-14");
    assert.equal(svc.reinf("2026-09").prazo, "2026-10-14");
    svc.definirPrazo("2026-09", "");
    assert.equal(svc.reinf("2026-09").prazo, "2026-10-15");
  });
  test("demonstração só quando vazio, e limpar desfaz", () => {
    const { svc } = amb();
    assert.ok(svc.carregarDemonstracao());
    assert.ok(svc.historico({ ano: 2026 }).lista.length > 0);
    assert.equal(svc.carregarDemonstracao(), false);
    assert.ok(svc.reinf("2026-09").confirmadas >= 1);
    const des = svc.limpar();
    assert.equal(svc.historico({}).lista.length, 0);
    des();
    assert.ok(svc.historico({}).lista.length > 0);
  });
});
