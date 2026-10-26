// Conciliação avulsa (extrato × planilha) em React: estado, salvas e o cruzamento com a planilha. Dados fictícios.
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../src/legado/core.js");
const Conciliacao = require("../src/legado/conciliacao.js");

let C;
before(async () => { C = await import("../src/lib/conciliar.mjs"); });
const memoria = () => {
  const d = {};
  return { get: (k) => (k in d ? JSON.parse(JSON.stringify(d[k])) : null), set: (k, v) => { d[k] = JSON.parse(JSON.stringify(v)); }, remove: (k) => { delete d[k]; }, keys: () => Object.keys(d) };
};
const E = (data, valorNum, sign, desc) => ({ data, valorNum, sign, desc });
const planilha = [
  ["Fornecedor", "CNPJ", "NF", "Data pagamento", "Valor pago"],
  ["AÇO FORTE LTDA", "11.111.111/0001-11", "10", "2026-07-02", 1000],
  ["TINTAS COLOR", "22.222.222/0001-22", "20", "2026-07-02", 1000],
  ["TRANSPORTES RÁPIDO", "", "30", "2026-07-04", 450],
  ["USINAGEM PRECISÃO", "", "123", "2026-07-08", 2300]
];
const extrato = () => C.prepararExtrato([
  E("2026-07-02", 1000, "D", "PAG BOLETO TINTAS COLOR"), E("2026-07-02", 1000, "D", "PAG BOLETO ACO FORTE"),
  E("2026-07-05", 450, "D", "PAG TRANSPORTES RAPIDO"), E("2026-07-06", 35, "D", "TARIFA PACOTE")
], "extrato.ofx");

describe("conciliação avulsa", () => {
  test("planilha de pagamentos × extrato: desempate pelo nome, data diferente e pendências", () => {
    const t = Conciliacao.lerPlanilhaTitulos(planilha, "pagamentos");
    assert.equal(t.ok, true);
    assert.equal(t.colunas.valor, "Valor pago");
    const r = C.calcular({ Core, Conciliacao, extrato: extrato(), sistema: t.itens, grupos: [], tolerancia: 3, avulso: true });
    assert.equal(r.resumo.ok, 2); assert.equal(r.resumo.data_diferente, 1);
    assert.equal(r.resumo.so_extrato, 1); assert.equal(r.resumo.so_sistema, 1);
    const aco = r.linhas.find((l) => l.sistema && /AÇO/.test(l.sistema.nome));
    assert.match(aco.extrato.desc, /ACO FORTE/);
  });

  test("juntar extratos: itens de todos, aviso de saldo e arquivos não lidos", () => {
    const j = C.juntarExtratos([
      { arquivo: "a.pdf", formato: "PDF Santander", itens: [E("2026-07-01", 10, "D", "X")], conferencia: { total: 2, conferidos: 2 } },
      { arquivo: "b.ofx", formato: "OFX", itens: [E("2026-07-02", 20, "C", "Y")] },
      { arquivo: "c.pdf", erro: "imagem" }
    ]);
    assert.equal(j.itens.length, 2); assert.equal(j.itens[1].origem, "b.ofx");
    assert.equal(j.formato, "2 arquivos");
    assert.equal(j.conferencia, ", saldos conferidos. Não li: c.pdf");
  });

  test("salvar, listar e trabalho não salvo", () => {
    const S = memoria();
    const av = Object.assign(C.avulsaVazia(), { extrato: extrato(), planilhaNome: "contas_pagas.xlsx", rows: planilha });
    assert.equal(C.nomeSugerido(av, () => "Julho de 2026"), "contas_pagas – Julho de 2026");
    assert.equal(C.trabalhoNaoSalvo(S, av), false);
    av.manuais = [C.grupoManual(["k1"], ["k2"], "")];
    assert.equal(C.trabalhoNaoSalvo(S, av), true);
    const s1 = C.salvarAvulsa(S, av, "Fan Metal – Julho", new Date("2026-10-26T10:00:00Z"));
    assert.equal(C.trabalhoNaoSalvo(S, s1), false);
    const s2 = C.salvarAvulsa(S, s1, "Fan Metal – Julho", new Date("2026-10-26T11:00:00Z"));
    assert.equal(s2.salvaId, s1.salvaId);   // mesmo nome atualiza
    const s3 = C.salvarAvulsa(S, s2, "Outra", new Date("2026-10-26T12:00:00Z"));
    assert.notEqual(s3.salvaId, s1.salvaId);
    assert.deepEqual(C.listarSalvas(S).map((x) => x.nome), ["Outra", "Fan Metal – Julho"]);
    s3.manuais = [];
    assert.equal(C.trabalhoNaoSalvo(S, s3), false);
  });
});
