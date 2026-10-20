// Departamento Cadastro (src/lib/depCadastro.mjs): empresas, certidões, alvarás, faturamentos e demonstrativos.
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

let D;
before(async () => { D = await import("../src/lib/depCadastro.mjs"); });
function amb(inicial) {
  const ls = Object.assign({}, inicial);
  let m = 0;
  const svc = D.criarDepCadastro({ ls: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } },
    agora: () => new Date(2026, 9, 20, 10), aoMudar: () => m++ });
  return { svc, ls, mudancas: () => m };
}
const painelAntigo = () => JSON.stringify({
  clientes: [{ id: "c1", nome: "Empresa Exemplo Ltda", documento: "11.111.111/0001-11", regime: "Simples" }],
  documentos: [
    { id: "d1", clienteId: "c1", tipo: "CND Federal", vencimento: "2026-10-18", andamento: "pendente", historico: [] },
    { id: "d2", clienteId: "c1", tipo: "Alvará", vencimento: "2026-11-30", historico: [] },
    { id: "d3", clienteId: "c1", tipo: "Certificado A1", vencimento: "2026-10-25", historico: [] }
  ]
});

describe("certidões e alvarás", () => {
  test("lê o que já estava no Painel de vencimentos e separa por grupo", () => {
    const { svc } = amb({ "painelVencimentos:v1": painelAntigo() });
    assert.deepEqual(svc.documentos("certidoes").map((d) => d.id), ["d1", "d3"]);
    assert.deepEqual(svc.documentos("alvaras").map((d) => d.id), ["d2"]);
    const [d1, d3] = svc.documentos("certidoes");
    assert.equal(d1.situacao.status, "vencido"); assert.equal(D.textoSituacao(d1.situacao), "Venceu há 2 dias");
    assert.equal(d3.situacao.status, "7"); assert.equal(d1.empresa, "Empresa Exemplo Ltda");
    assert.equal(svc.urgentes("certidoes"), 2);
    assert.deepEqual(svc.resumo("alvaras"), { total: 1, vencido: 0, "7": 0, "30": 0, ok: 1 });
  });
  test("novo documento valida e grava no formato do painel, sem perder os outros campos", () => {
    const { svc, ls } = amb({ "painelVencimentos:v1": painelAntigo() });
    assert.throws(() => svc.salvarDocumento({ clienteId: "c1", tipo: "CRF FGTS" }), /vencimento/);
    assert.throws(() => svc.salvarDocumento({ clienteId: "c1", tipo: "CRF FGTS", vencimento: "2026-12-01", link: "javascript:x" }), /http/);
    const d = svc.salvarDocumento({ clienteId: "c1", tipo: "CRF FGTS", vencimento: "2026-12-01", numero: " 123 " });
    assert.equal(d.numero, "123"); assert.equal(d.andamento, "pendente"); assert.deepEqual(d.historico, []);
    const e = JSON.parse(ls["painelVencimentos:v1"]);
    assert.equal(e.documentos.length, 4); assert.equal(e.clientes[0].regime, "Simples");
  });
  test("renovar guarda o histórico e não aceita data anterior", () => {
    const { svc } = amb({ "painelVencimentos:v1": painelAntigo() });
    assert.throws(() => svc.renovar("d1", { vencimento: "2026-10-01" }), /depois do atual/);
    const d = svc.renovar("d1", { vencimento: "2027-04-18", emissao: "2026-10-20", obs: "emitida no e-CAC" });
    assert.equal(d.vencimento, "2027-04-18");
    assert.deepEqual(d.historico[0], { data: "2026-10-20", vencimentoAnterior: "2026-10-18", novoVencimento: "2027-04-18", emissaoAnterior: "", numeroAnterior: "", obs: "emitida no e-CAC" });
    assert.equal(svc.documentos("certidoes").find((x) => x.id === "d1").situacao.status, "ok");
  });
  test("excluir tem desfazer", () => {
    const { svc } = amb({ "painelVencimentos:v1": painelAntigo() });
    const desfazer = svc.excluirDocumento("d3");
    assert.equal(svc.documentos("certidoes").length, 1);
    desfazer();
    assert.equal(svc.documentos("certidoes").length, 2);
  });
  test("grupo pelo tipo", () => {
    assert.equal(D.grupoDoTipo("Alvará sanitário"), "alvaras");
    assert.equal(D.grupoDoTipo("alvara"), "alvaras");
    assert.equal(D.grupoDoTipo("Procuração"), "certidoes");
  });
});

describe("empresas", () => {
  test("cria, não repete nome e só exclui sem documentos", () => {
    const { svc } = amb({ "painelVencimentos:v1": painelAntigo() });
    assert.throws(() => svc.salvarEmpresa({ nome: "empresa exemplo ltda" }), /Já existe/);
    const n = svc.salvarEmpresa({ nome: "Outra Empresa SA", documento: "22" });
    assert.deepEqual(svc.empresas().map((c) => c.nome), ["Empresa Exemplo Ltda", "Outra Empresa SA"]);
    assert.throws(() => svc.excluirEmpresa("c1"), /3 documento/);
    svc.definirFaturamento("2026", n.id, "01", 10);
    svc.excluirEmpresa(n.id);
    assert.equal(svc.empresas().length, 1);
    assert.deepEqual(svc.faturamentos("2026"), {});
  });
});

describe("faturamentos e demonstrativos", () => {
  test("faturamento por mês, total do ano e últimos 12 meses atravessando o ano", () => {
    const { svc } = amb();
    svc.definirFaturamento("2025", "c1", "11", 1000);
    svc.definirFaturamento("2025", "c1", "12", 2000.555);
    svc.definirFaturamento("2026", "c1", "01", 500);
    svc.definirFaturamento("2026", "c1", "10", 300);
    assert.equal(svc.faturamentos("2025").c1["12"], 2000.56);
    assert.equal(svc.totalAno("2026", "c1"), 800);
    assert.equal(svc.ultimos12("c1", "2026-10"), 1000 + 2000.56 + 500 + 300);
    assert.equal(svc.ultimos12("c1", "2026-09"), 1000 + 2000.56 + 500);
    svc.definirFaturamento("2026", "c1", "10", null);
    assert.equal(svc.totalAno("2026", "c1"), 500);
  });
  test("demonstrativos por empresa e ano, com progresso", () => {
    const { svc } = amb({ "painelVencimentos:v1": painelAntigo() });
    svc.definirDemonstrativo("2025", "c1", "DRE", "entregue");
    svc.definirDemonstrativo("2025", "c1", "Balancete", "nao_se_aplica");
    svc.definirDemonstrativo("2025", "c1", "Balanço Patrimonial", "emitido");
    assert.equal(svc.demonstrativos("2025").c1.DRE.status, "entregue");
    assert.deepEqual(svc.progressoDemonstrativos("2025"), { total: 2, entregues: 1, emitidos: 1, pendentes: 0 });
    svc.definirDemonstrativo("2025", "c1", "DRE", "");
    assert.equal(svc.demonstrativos("2025").c1.DRE, undefined);
    assert.throws(() => svc.definirDemonstrativo("2025", "c1", "DRE", "x"), /inválida/);
  });
  test("cada gravação avisa as telas", () => {
    const { svc, mudancas } = amb();
    svc.salvarEmpresa({ nome: "X" });
    assert.equal(mudancas(), 1);
  });
});
