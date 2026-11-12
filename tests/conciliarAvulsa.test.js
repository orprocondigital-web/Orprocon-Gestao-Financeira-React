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
    const s1 = C.salvarAvulsa(S, av, "Fam Metal – Julho", new Date("2026-10-26T10:00:00Z"));
    assert.equal(C.trabalhoNaoSalvo(S, s1), false);
    const s2 = C.salvarAvulsa(S, s1, "Fam Metal – Julho", new Date("2026-10-26T11:00:00Z"));
    assert.equal(s2.salvaId, s1.salvaId);   // mesmo nome atualiza
    const s3 = C.salvarAvulsa(S, s2, "Outra", new Date("2026-10-26T12:00:00Z"));
    assert.notEqual(s3.salvaId, s1.salvaId);
    assert.deepEqual(C.listarSalvas(S).map((x) => x.nome), ["Outra", "Fam Metal – Julho"]);
    s3.manuais = [];
    assert.equal(C.trabalhoNaoSalvo(S, s3), false);
  });
});

describe("conciliação avulsa no servidor", () => {
  const av = () => Object.assign(C.avulsaVazia(), {
    extrato: [E("2026-10-02", 100, "D", "PIX"), E("2026-10-20", 50, "D", "TED"), E("2026-09-30", 10, "D", "TARIFA")],
    rows: planilha, planilhaNome: "Contas pagas.xlsx", empresaCnpj: "11222333000181", empresaNome: "Comercial Exemplo Ltda",
    competencia: "2026-10", manuais: [{ ext: ["a"], sis: [], tipo: "justificado", obs: "tarifa" }], salvaId: "av1", salvaNome: "Velha"
  });
  test("competência pelo mês com mais movimentos do extrato", () => {
    assert.equal(C.competenciaProvavel(av()), "2026-10");
    assert.equal(C.competenciaProvavel(C.avulsaVazia()), "");
  });
  test("pedido: estado sem o que é só da tela e resumo da lista", () => {
    const r = { resumo: { ok: 4, data_diferente: 1, manual: 2, justificado: 3, so_extrato: 2, so_sistema: 1 } };
    const p = C.pedidoParaServidor(Object.assign(av(), { servidor: { id: "x", versao: 3, base: "" }, empresaCnpj: "11.222.333/0001-81" }), r, " Comercial – Out ");
    assert.equal(p.nome, "Comercial – Out");
    assert.equal(p.empresaCnpj, "11222333000181");
    assert.deepEqual([p.ok, p.soExtrato, p.soPlanilha, p.conferidos], [7, 2, 1, 3]);
    const e = JSON.parse(p.estado);
    assert.equal(e.servidor, undefined);
    assert.equal(e.salvaId, undefined);
    assert.equal(e.extrato.length, 3);
    assert.equal(e.competencia, "2026-10");
    assert.deepEqual([C.pedidoParaServidor(C.avulsaVazia(), null, "X").ok, C.pedidoParaServidor(C.avulsaVazia(), null, "X").tipo], [0, "pagamentos"]);
  });
  test("abrir do servidor, mexer e saber se falta subir", () => {
    const p = C.pedidoParaServidor(av(), null, "Comercial – Out");
    const dto = { id: "c1", versao: 2, nome: "Comercial – Out", empresaCnpj: "11222333000181", empresaNome: "Comercial Exemplo Ltda", competencia: "2026-10",
      atualizadoEm: "2026-11-09T17:30:00Z", atualizadoPorNome: "Bia Exemplo", estado: JSON.parse(p.estado) };
    const a = C.avulsaDoServidor(dto);
    assert.equal(a.salvaNome, "Comercial – Out");
    assert.equal(a.salvaId, null, "não confunde com as salvas do navegador");
    assert.deepEqual([a.servidor.id, a.servidor.versao], ["c1", 2]);
    assert.equal(C.mudouDesdeOServidor(a), false);
    const b = Object.assign({}, a, { manuais: a.manuais.concat({ ext: ["b"], sis: [], tipo: "justificado", obs: "" }) });
    assert.equal(C.mudouDesdeOServidor(b), true);
    const depois = C.depoisDeSalvar(b, Object.assign({}, dto, { versao: 3 }));
    assert.equal(depois.servidor.versao, 3);
    assert.equal(C.mudouDesdeOServidor(depois), false);
    assert.equal(C.mudouDesdeOServidor(av()), false, "sem servidor, nunca");
  });
  test("rótulo da lista", () => {
    const base = { nome: "Comercial Exemplo", competencia: "2026-10", soExtrato: 2, soPlanilha: 1, atualizadoPorNome: "Bia Exemplo", atualizadoEm: "2026-11-09T17:30:00Z" };
    assert.equal(C.rotuloDaConciliacao(base), "Comercial Exemplo · 10/2026 · 3 pendências · Bia, 09/11, 14:30");
    assert.equal(C.rotuloDaConciliacao(Object.assign({}, base, { soExtrato: 0, soPlanilha: 0, competencia: "", atualizadoEm: "" })), "Comercial Exemplo · fechada · Bia");
    assert.equal(C.rotuloDaConciliacao(Object.assign({}, base, { nome: "Comercial – Outubro de 2026" })), "Comercial – Outubro de 2026 · 3 pendências · Bia, 09/11, 14:30");
  });
});
