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

describe("leitura de PDF de certidão", () => {
  test("CND Federal: CNPJ, emissão, validade e código de controle", () => {
    const t = "MINISTÉRIO DA FAZENDA Secretaria da Receita Federal do Brasil CERTIDÃO NEGATIVA DE DÉBITOS RELATIVOS AOS TRIBUTOS FEDERAIS E À DÍVIDA ATIVA DA UNIÃO " +
      "Nome: EMPRESA EXEMPLO LTDA CNPJ: 11.111.111/0001-11 ... Emitida às 10:22:33 do dia 15/09/2026 <hora e data de Brasília>. Válida até 14/03/2027. " +
      "Código de controle da certidão: AB12.CD34.EF56.GH78";
    assert.deepEqual(D.lerCertidao(t), { tipo: "CND Federal", documento: "11.111.111/0001-11", nome: "EMPRESA EXEMPLO LTDA", emissao: "2026-09-15", vencimento: "2027-03-14", numero: "AB12.CD34.EF56.GH78" });
  });
  test("CRF FGTS: validade de/até pega a data final", () => {
    const r = D.lerCertidao("Certificado de Regularidade do FGTS - CRF Inscrição: 22.222.222/0001-22 Validade: 01/10/2026 a 30/10/2026 Certificação Número: 2026100112345");
    assert.equal(r.tipo, "CRF FGTS"); assert.equal(r.vencimento, "2026-10-30"); assert.equal(r.nome, ""); assert.equal(r.numero, "2026100112345");
  });
  test("CNDT, alvará e sem a palavra validade", () => {
    const cndt = D.lerCertidao("CERTIDÃO NEGATIVA DE DÉBITOS TRABALHISTAS Nome: X CNPJ: 33.333.333/0001-33 Certidão nº: 12345678/2026 Expedição: 15/09/2026, às 10:00:00 Validade: 13/03/2027 - 180 dias");
    assert.equal(cndt.tipo, "CND Trabalhista"); assert.equal(cndt.emissao, "2026-09-15"); assert.equal(cndt.vencimento, "2027-03-13"); assert.equal(cndt.numero, "12345678/2026");
    assert.equal(D.lerCertidao("PREFEITURA MUNICIPAL ALVARÁ SANITÁRIO emitido em 02/01/2026 ... 31/12/2026").tipo, "Alvará sanitário");
    assert.equal(D.lerCertidao("PREFEITURA MUNICIPAL ALVARÁ SANITÁRIO emitido em 02/01/2026 ... 31/12/2026").vencimento, "2026-12-31");
    assert.equal(D.tipoPeloTexto("Prefeitura Municipal de Tubarão certidão negativa"), "CND Municipal");
    assert.equal(D.tipoPeloTexto("Secretaria de Estado da Fazenda de Santa Catarina"), "CND Estadual");
    assert.deepEqual(D.lerCertidao("texto qualquer"), { tipo: "", documento: "", nome: "", emissao: "", vencimento: "", numero: "" });
  });
});

describe("importar planilha", () => {
  const Core = require("../src/legado/core.js");
  test("reconhece documentos, faturamento e empresas pelas colunas", () => {
    const abas = [
      { nome: "Certidões", rows: [["Empresa", "CNPJ", "Tipo", "Vencimento"], ["Nova Empresa SA", "44.444.444/0001-44", "CND Federal", "30/11/2026"], ["Nova Empresa SA", "", "CRF FGTS", ""], ["Empresa Exemplo Ltda", "", "Alvará sanitário", new Date(Date.UTC(2026, 11, 31))]] },
      { nome: "Faturamento 2025", rows: [["Razão social", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun"], ["Nova Empresa SA", 1000, "2.500,50", "", 10, 20, 30], ["Total", 1, 1, 1, 1, 1, 1]] },
      { nome: "Lista", rows: [["Cliente", "CNPJ"], ["Terceira Ltda", "55"]] },
      { nome: "Outra", rows: [["a", "b"], [1, 2]] }
    ];
    const p = D.lerPlanilhaCadastro(abas, Core.toIsoDate, 2026);
    assert.deepEqual(p.abas.map((a) => [a.tipo, a.linhas]), [["documentos", 2], ["faturamentos", 1], ["empresas", 1], ["ignorada", 0]]);
    assert.equal(p.avisos.length, 1);
    assert.deepEqual(p.empresas.map((e) => e.nome), ["Nova Empresa SA", "Empresa Exemplo Ltda", "Terceira Ltda"]);
    assert.deepEqual(p.faturamentos.map((f) => [f.ano, f.mes, f.valor]), [["2025", "01", 1000], ["2025", "02", 2500.5], ["2025", "04", 10], ["2025", "05", 20], ["2025", "06", 30]]);
    const { svc } = amb({ "painelVencimentos:v1": painelAntigo() });
    const r = svc.aplicarPlanilha(p);
    assert.deepEqual(r, { novasEmp: 2, novosDocs: 2, repetidos: 0, faturamentos: 5 });
    assert.equal(svc.aplicarPlanilha(p).repetidos, 2, "importar de novo não duplica");
    assert.equal(svc.empresas().length, 3);
    assert.equal(svc.documentos("alvaras").length, 2);
    assert.equal(svc.empresaPorDocumento("44444444000144").nome, "Nova Empresa SA");
  });
});

describe("demonstração e limpar", () => {
  test("carrega só onde está vazio, tira só a demonstração e desfaz", () => {
    const exemplo = { clientes: [{ id: "ex-c1", nome: "Alfa" }, { id: "ex-c2", nome: "Beta" }], documentos: [{ id: "ex-d1", clienteId: "ex-c1", tipo: "CND Federal", vencimento: "2026-11-01" }] };
    const { svc } = amb();
    assert.ok(svc.carregarDemonstracao(exemplo));
    assert.ok(svc.temDemonstracao());
    assert.ok(Object.keys(svc.faturamentos("2026")).length === 2);
    assert.ok(Object.keys(svc.demonstrativos("2025")).length === 2);
    assert.equal(svc.carregarDemonstracao(exemplo), false, "não carrega duas vezes");
    svc.salvarEmpresa({ nome: "Empresa de verdade" });
    svc.salvarDocumento({ clienteId: "ex-c2", tipo: "CRF FGTS", vencimento: "2026-12-01" });
    const desfazer = svc.limpar(true);
    assert.deepEqual(svc.empresas().map((c) => c.nome), ["Beta", "Empresa de verdade"], "Beta ficou: recebeu um documento de verdade");
    assert.equal(svc.documentos("certidoes").length, 1);
    assert.deepEqual(svc.faturamentos("2026"), {});
    desfazer();
    assert.equal(svc.empresas().length, 3);
    assert.equal(svc.documentos("certidoes").length, 2);
    svc.limpar(false);
    assert.equal(svc.empresas().length, 0);
  });
  test("anexo marcado no documento", () => {
    const { svc } = amb({ "painelVencimentos:v1": painelAntigo() });
    svc.marcarAnexo("d1", { nome: "cnd.pdf", tamanho: 1234 });
    assert.deepEqual(svc.documentos("certidoes")[0].anexo, { nome: "cnd.pdf", tamanho: 1234 });
    svc.marcarAnexo("d1", null);
    assert.equal(svc.documentos("certidoes")[0].anexo, undefined);
  });
});
