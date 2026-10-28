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
    assert.deepEqual(D.lerCertidao(t), { tipo: "CND Federal", modelo: "", documento: "11.111.111/0001-11", nome: "EMPRESA EXEMPLO LTDA", emissao: "2026-09-15", vencimento: "2027-03-14", numero: "AB12.CD34.EF56.GH78" });
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
    assert.deepEqual(D.lerCertidao("texto qualquer"), { tipo: "", modelo: "", documento: "", nome: "", emissao: "", vencimento: "", numero: "" });
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
    assert.deepEqual([r.novasEmp, r.novosDocs, r.repetidos, r.faturamentos], [2, 2, 0, 5]);
    assert.equal(r.ids["n:empresa exemplo ltda"], "c1");
    assert.equal(svc.aplicarPlanilha(p).repetidos, 2, "importar de novo não duplica");
    assert.equal(svc.empresas().length, 3);
    assert.equal(svc.documentos("alvaras").length, 2);
    assert.equal(svc.empresaPorDocumento("44444444000144").nome, "Nova Empresa SA");
  });
});

describe("cadastro geral de empresas", () => {
  test("regime, código e período de cliente; CNPJ repetido é barrado", () => {
    const { svc } = amb({ "painelVencimentos:v1": painelAntigo() });
    assert.equal(svc.empresas()[0].regime, "Simples Nacional", "o texto antigo vira o regime da lista");
    const e = svc.salvarEmpresa({ nome: "Nova Ltda", documento: "22.222.222/0001-22", regime: "Lucro Real", codigo: " 77 ", inicio: "2026-03" });
    assert.deepEqual([e.codigo, e.regime, e.inicio, e.saida], ["77", "Lucro Real", "2026-03", ""]);
    assert.throws(() => svc.salvarEmpresa({ nome: "Outra", documento: "22222222000122" }), /já está em "Nova Ltda"/);
    assert.throws(() => svc.salvarEmpresa({ nome: "Outra", regime: "Lucro Imaginário" }), /Regime/);
    assert.throws(() => svc.salvarEmpresa({ nome: "Outra", inicio: "03/2026" }), /AAAA-MM/);
    assert.throws(() => svc.salvarEmpresa({ nome: "Outra", inicio: "2026-05", saida: "2026-04" }), /depois/);
    svc.salvarEmpresa({ nome: "Nova Ltda", documento: "22.222.222/0001-22", regime: "Lucro Presumido", saida: "2026-09" }, e.id);
    assert.equal(svc.empresas().find((c) => c.id === e.id).regime, "Lucro Presumido");
    assert.equal(svc.qtdDocumentos().c1, 3);
  });
  test("matriz e filial pelo CNPJ; ativa no mês; regime por texto", () => {
    const { svc } = amb();
    svc.salvarEmpresa({ nome: "Matriz SA", documento: "33.333.333/0001-33" });
    svc.salvarEmpresa({ nome: "Matriz SA - Filial Sul", documento: "33.333.333/0002-14" });
    svc.salvarEmpresa({ nome: "Filial sem matriz", documento: "44.444.444/0003-00" });
    svc.salvarEmpresa({ nome: "Pessoa", documento: "123.456.789-00" });
    const l = svc.empresas(), por = (n) => l.find((c) => c.nome === n);
    assert.equal(por("Matriz SA - Filial Sul").matrizId, por("Matriz SA").id);
    assert.equal(por("Filial sem matriz").filial, true); assert.equal(por("Filial sem matriz").matrizId, "");
    assert.equal(por("Pessoa").filial, false);
    assert.ok(D.ativaNoMes({ inicio: "2026-03", saida: "2026-09" }, "2026-09"));
    assert.ok(!D.ativaNoMes({ inicio: "2026-03" }, "2026-02"));
    assert.ok(!D.ativaNoMes({ saida: "2026-09" }, "2026-10"));
    assert.deepEqual(["SN", "L. Presumido", "lucro real", "MEI", "Isenta", "xyz"].map(D.regimePeloTexto),
      ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI", "Isenta", ""]);
    assert.deepEqual(["IM", "IS", "Imune"].map(D.regimePeloTexto), ["Imune", "Isenta", "Imune"]);
    assert.equal(D.nomeDoEmail("ana.paula_souza@exemplo.com"), "Ana Paula Souza");
    assert.equal(D.nomeDoEmail("Bruno"), "Bruno");
  });
  test("planilha de empresas traz código e regime", () => {
    const { svc } = amb();
    const p = D.lerPlanilhaCadastro([{ nome: "Empresas", rows: [["Cód.", "Empresa", "CNPJ", "Regime"], [12, "Ômega Ltda", "55.555.555/0001-55", "Simples"]] }], (v) => v, 2026);
    assert.deepEqual(p.empresas, [{ chave: "d:55555555000155", nome: "Ômega Ltda", documento: "55.555.555/0001-55", regime: "Simples Nacional", codigo: "12" }]);
    svc.aplicarPlanilha(p);
    assert.equal(svc.empresas()[0].codigo, "12");
  });
});

describe("sócios, Lucro Real, baixa e cadastro do sistema antigo", () => {
  test("sócios validados; filial usa os da matriz; baixa encerra o período", () => {
    const { svc } = amb();
    assert.throws(() => svc.salvarEmpresa({ nome: "X", socios: [{ nome: "A", percentual: 70 }, { nome: "B", percentual: 40 }] }), /110%/);
    assert.throws(() => svc.salvarEmpresa({ nome: "X", regime: "Lucro Real", tipoLucroReal: "Mensal" }), /Lucro Real/);
    const m = svc.salvarEmpresa({ nome: "Matriz", documento: "33.333.333/0001-33", regime: "Lucro Real", tipoLucroReal: "Trimestral",
      socios: [{ nome: " Sócio A ", percentual: "60,5" }, { nome: "", percentual: 10 }, { nome: "Sócia B", percentual: 39.5, entrada: "2020-01-01" }] });
    assert.deepEqual(m.socios.map((x) => [x.nome, x.percentual]), [["Sócio A", 60.5], ["Sócia B", 39.5]]);
    assert.equal(svc.salvarEmpresa({ nome: "Outra", regime: "Simples Nacional", tipoLucroReal: "Anual" }).tipoLucroReal, "", "tipo do LR só para Lucro Real");
    svc.salvarEmpresa({ nome: "Filial", documento: "33.333.333/0002-14" });
    const f = svc.empresas().find((c) => c.nome === "Filial");
    assert.ok(f.sociosDaMatriz); assert.equal(f.socios.length, 2);
    assert.throws(() => svc.salvarEmpresa({ nome: "Y", baixa: "31/08/2026" }), /baixa/);
    assert.ok(D.ativaNoMes({ baixa: "2026-08-31" }, "2026-08"));
    assert.ok(!D.ativaNoMes({ baixa: "2026-08-31" }, "2026-09"));
  });
  test("lê o cadastro exportado do sistema antigo, sem as senhas", () => {
    const toIso = (v) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v || "")); return m ? m[3] + "-" + m[2] + "-" + m[1] : ""; };
    const cab = ["ID", "Nome", "CNPJ", "Regime", "Segmento", "Contato", "FormaRecebimento", "Obs", "Responsavel", "Socios_JSON", "DeptoContabil", "DeptoFiscal",
      "DeptoPessoal", "CertValidade", "CertSenha", "Tipo", "MatrizId", "DataBaixa", "LucroBruto", "TipoLucroReal", "Incorporadora", "ResponsavelHist", "Entrada", "Saida", "SenhaNFSe"];
    const linha = ["EMP1", "Alfa Exemplo Ltda", "11.111.111/0001-11", "LR", "Comércio", "Contato Exemplo", "Boleto", "obs", "ana.exemplo@exemplo.com",
      JSON.stringify([{ nome: "Sócio Um", percentual: 70, dataEntrada: "01/01/2020" }, { nome: "Sócio Dois", percentual: 30 }]), "", "bruno@exemplo.com", "",
      "", "senha-que-nao-pode-vir", "Matriz", "", "", "8", "Trimestral", false,
      JSON.stringify([{ email: "carla@exemplo.com", inicio: "01/2026" }, { email: "ana.exemplo@exemplo.com", inicio: "06/2026" }]), "03/2024", "", "outra-senha"];
    const p = D.lerPlanilhaCadastro([{ nome: "Empresas", rows: [cab, linha] }], toIso, 2026);
    const e = p.empresas[0];
    assert.deepEqual([e.regime, e.tipoLucroReal, e.segmento, e.inicio, e.socios.length], ["Lucro Real", "Trimestral", "Comércio", "2024-03", 2]);
    assert.deepEqual(e.responsaveis, { contabil: "Ana Exemplo", fiscal: "Bruno" });
    assert.deepEqual(e.histContabil, [{ desde: "2026-01", nome: "Carla" }, { desde: "2026-06", nome: "Ana Exemplo" }]);
    assert.ok(!JSON.stringify(p).includes("senha"), "nenhuma senha entra no plano");
    const { svc } = amb();
    svc.aplicarPlanilha(p);
    const c = svc.empresas()[0];
    assert.deepEqual([c.regime, c.tipoLucroReal, c.socios[0].entrada], ["Lucro Real", "Trimestral", "2020-01-01"]);
  });
});

describe("demonstração e limpar", () => {
  test("carrega só onde está vazio, tira só a demonstração e desfaz", () => {
    const exemplo = { clientes: [{ id: "ex-c1", nome: "Alfa" }, { id: "ex-c2", nome: "Beta" }], documentos: [{ id: "ex-d1", clienteId: "ex-c1", tipo: "CND Federal", vencimento: "2026-11-01" }] };
    const { svc } = amb();
    assert.ok(svc.carregarDemonstracao(exemplo));
    assert.ok(svc.temDemonstracao());
    assert.equal(Object.keys(svc.faturamentos("2026")).length, 3, "Alfa, Beta e a filial da Alfa");
    assert.equal(Object.keys(svc.demonstrativos("2025")).length, 3);
    const alfa = svc.empresas().find((c) => c.id === "ex-c1"), filial = svc.empresas().find((c) => c.id === "ex-filial");
    assert.ok(alfa.regime && alfa.documento && !alfa.filial);
    assert.equal(filial.matrizId, "ex-c1");
    assert.equal(svc.carregarDemonstracao(exemplo), false, "não carrega duas vezes");
    svc.salvarEmpresa({ nome: "Empresa de verdade" });
    svc.salvarDocumento({ clienteId: "ex-c2", tipo: "CRF FGTS", vencimento: "2026-12-01" });
    const desfazer = svc.limpar(true);
    assert.deepEqual(svc.empresas().map((c) => c.nome), ["Beta", "Empresa de verdade"], "Beta ficou: recebeu um documento de verdade");
    assert.equal(svc.documentos("certidoes").length, 1);
    assert.deepEqual(svc.faturamentos("2026"), {});
    desfazer();
    assert.equal(svc.empresas().length, 4);
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

describe("certificado digital (A1/A3)", () => {
  test("tipo e modelo: Certificado A1/A3, e-CNPJ e token viram Certificado Digital; CRF FGTS não", () => {
    assert.deepEqual(D.normalizarTipo("Certificado A1"), { tipo: "Certificado Digital", modelo: "A1" });
    assert.deepEqual(D.normalizarTipo("Certificado A3"), { tipo: "Certificado Digital", modelo: "A3" });
    assert.deepEqual(D.normalizarTipo("e-CNPJ token"), { tipo: "Certificado Digital", modelo: "A3" });
    assert.deepEqual(D.normalizarTipo("Certificado Digital", "a3"), { tipo: "Certificado Digital", modelo: "A3" });
    assert.deepEqual(D.normalizarTipo("Certificado Digital"), { tipo: "Certificado Digital", modelo: "" });
    assert.deepEqual(D.normalizarTipo("CRF FGTS"), { tipo: "CRF FGTS", modelo: "" });
    assert.equal(D.ehCertificado("Certificado de Regularidade do FGTS"), false);
    assert.ok(D.TIPOS_CERTIDOES.includes("Certificado Digital") && !D.TIPOS_CERTIDOES.includes("Certificado A1"));
    assert.equal(D.nomeDoTipo({ tipo: "Certificado Digital", modelo: "A3" }), "Certificado Digital · A3");
  });
  test("o que estava como Certificado A1 é lido como Certificado Digital A1 e grava assim na próxima mudança", () => {
    const { svc, ls } = amb({ "painelVencimentos:v1": painelAntigo() });
    const d3 = svc.documentos("certidoes").find((d) => d.id === "d3");
    assert.equal(d3.tipo, "Certificado Digital"); assert.equal(d3.modelo, "A1"); assert.equal(d3.cnpj, "11.111.111/0001-11");
    svc.salvarDocumento({ clienteId: "c1", tipo: "CRF FGTS", vencimento: "2026-12-01" });
    const salvo = JSON.parse(ls["painelVencimentos:v1"]).documentos.find((d) => d.id === "d3");
    assert.equal(salvo.tipo, "Certificado Digital"); assert.equal(salvo.modelo, "A1");
  });
  test("salvar guarda o modelo só no certificado", () => {
    const { svc } = amb({ "painelVencimentos:v1": painelAntigo() });
    assert.equal(svc.salvarDocumento({ clienteId: "c1", tipo: "Certificado Digital", modelo: "A3", vencimento: "2027-05-01" }).modelo, "A3");
    assert.equal(svc.salvarDocumento({ clienteId: "c1", tipo: "CND Estadual", modelo: "A3", vencimento: "2027-05-01" }).modelo, "");
  });
  test("PDF de certificado: tipo e modelo pelo texto", () => {
    const r = D.lerCertidao("Certificado Digital e-CNPJ A3 ICP-Brasil CNPJ 11.111.111/0001-11 Validade: 01/12/2027");
    assert.equal(r.tipo, "Certificado Digital"); assert.equal(r.modelo, "A3"); assert.equal(r.vencimento, "2027-12-01");
  });
  test("planilha com a coluna Modelo e o tipo antigo", () => {
    const toIso = (v) => { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(v)); return m ? m[3] + "-" + m[2] + "-" + m[1] : ""; };
    const plano = D.lerPlanilhaCadastro([{ nome: "Certificados", rows: [["Empresa", "Tipo", "Modelo", "Vencimento"],
      ["Empresa Exemplo Ltda", "Certificado Digital", "A3", "10/11/2026"], ["Empresa Exemplo Ltda", "Certificado A1", "", "01/03/2027"]] }], toIso, 2026);
    const { svc } = amb({ "painelVencimentos:v1": painelAntigo() });
    const r = svc.aplicarPlanilha(plano);
    assert.equal(r.novosDocs, 2);
    const c = svc.certificados().lista.map((d) => d.vencimento + " " + d.modelo);
    assert.deepEqual(c, ["2026-10-25 A1", "2026-11-10 A3", "2027-03-01 A1"]);
  });
  test("painel: vencidos, até 30 dias e em dia, contagem A1/A3 e linhas do Excel", () => {
    const { svc } = amb({ "painelVencimentos:v1": painelAntigo() });
    svc.salvarDocumento({ clienteId: "c1", tipo: "Certificado Digital", modelo: "A3", vencimento: "2026-10-10", responsavel: "Ana" });
    svc.salvarDocumento({ clienteId: "c1", tipo: "Certificado Digital", vencimento: "2027-06-01" });
    const g = svc.certificados();
    assert.equal(g.lista.length, 3);
    assert.deepEqual([g.vencidos.length, g.ate30.length, g.emDia.length], [1, 1, 1]);
    assert.deepEqual([g.A1, g.A3, g.semModelo], [1, 1, 1]);
    const l = D.linhasCertificados(g.vencidos);
    assert.equal(l[0][0], "Empresa"); assert.equal(l[0][2], "Modelo");
    assert.deepEqual(l[1], ["Empresa Exemplo Ltda", "11.111.111/0001-11", "A3", "", "", "10/10/2026", "Venceu há 10 dias", "Ana", ""]);
  });
});

describe("avisos do Início e mensagem de renovação", () => {
  test("avisos: certidões/alvarás até 7 dias, certificados até 30, vencidos primeiro", () => {
    const { svc } = amb({ "painelVencimentos:v1": painelAntigo() });   // hoje = 20/10/2026
    svc.salvarDocumento({ clienteId: "c1", tipo: "Certificado Digital", modelo: "A3", vencimento: "2026-11-15" });   // 26 dias: entra
    svc.salvarDocumento({ clienteId: "c1", tipo: "CND Estadual", vencimento: "2026-11-15" });                        // 26 dias: não entra
    svc.salvarDocumento({ clienteId: "c1", tipo: "Alvará sanitário", vencimento: "2026-10-22" });                    // 2 dias: entra
    const a = svc.avisos();
    assert.deepEqual(a.lista.map((d) => d.tipo + "|" + d.grupo), ["CND Federal|certidoes", "Alvará sanitário|alvaras", "Certificado Digital|certificados", "Certificado Digital|certificados"]);
    assert.equal(a.vencidos, 1);
  });
  test("mensagem: certificado A3 a vencer, com contato, e-mail e WhatsApp", () => {
    const m = D.mensagemRenovacao({ empresa: "Beta Ltda", cnpj: "22.222.222/0001-22", tipo: "Certificado Digital", modelo: "A3", vencimento: "2026-11-15",
      situacao: { dias: 26 }, contato: { nome: "Carla", email: "carla@exemplo.com", telefone: "(48) 99999-0000" } }, "Equipe X");
    assert.equal(m.assunto, "Beta Ltda - renovação do certificado digital");
    assert.match(m.texto, /^Olá, Carla!/);
    assert.match(m.texto, /certificado digital A3 da Beta Ltda \(CNPJ 22\.222\.222\/0001-22\) vence em 15\/11\/2026\./);
    assert.match(m.texto, /token ou cartão/); assert.match(m.texto, /Equipe X$/);
    assert.ok(m.email.startsWith("mailto:carla%40exemplo.com?subject=")); assert.ok(m.whatsapp.startsWith("https://wa.me/5548999990000?text="));
    assert.equal(m.temEmail, true); assert.equal(m.temTelefone, true);
  });
  test("mensagem: certidão vencida, sem contato", () => {
    const m = D.mensagemRenovacao({ empresa: "Beta Ltda", tipo: "CND Federal", vencimento: "2026-10-18", situacao: { dias: -2 } });
    assert.match(m.texto, /^Olá!/); assert.match(m.texto, /a CND Federal da Beta Ltda venceu em 18\/10\/2026\./);
    assert.match(m.texto, /nova via/); assert.match(m.texto, /Equipe Orprocon$/);
    assert.equal(m.temEmail, false); assert.ok(m.whatsapp.startsWith("https://wa.me/?text="));
  });
});

describe("alvarás: grade e planilha de renovação", () => {
  const Core = require("../src/legado/core.js");
  test("célula da planilha: data, situação e anotação", () => {
    const c = (v) => D.lerCelulaAlvara(v, Core.toIsoDate);
    assert.equal(c(""), null);
    assert.deepEqual(c(new Date(2026, 11, 31)), { vencimento: "2026-12-31", situacao: "", observacao: "" });
    assert.deepEqual(c("22.04.2027"), { vencimento: "2027-04-22", situacao: "", observacao: "" });
    assert.deepEqual(c("10/01/2027 (10/01/2027)"), { vencimento: "2027-01-10", situacao: "", observacao: "" });
    assert.deepEqual(c("VENCIDO"), { vencimento: "", situacao: "vencido", observacao: "" });
    assert.deepEqual(c("DISPENSADO - RET"), { vencimento: "", situacao: "dispensado", observacao: "DISPENSADO - RET" });
    assert.deepEqual(c("NÃO POSSUI "), { vencimento: "", situacao: "nao_possui", observacao: "" });
    assert.deepEqual(c("taxa atrasada"), { vencimento: "", situacao: "debitos", observacao: "taxa atrasada" });
    assert.deepEqual(c("RENOVADO"), { vencimento: "", situacao: "renovado", observacao: "" });
    assert.deepEqual(c("Precisa do Habita-se"), { vencimento: "", situacao: "", observacao: "Precisa do Habita-se" });
    assert.equal(c("PERMANENTE").situacao, "permanente");
  });
  test("situação na grade: cor por data e por situação", () => {
    const h = "2026-10-20";
    assert.equal(D.situacaoAlvara(null, h).cor, "branco");
    assert.equal(D.situacaoAlvara({ vencimento: "2027-05-01" }, h).cor, "verde");
    assert.equal(D.situacaoAlvara({ vencimento: "2026-11-01" }, h).cor, "amarelo");
    assert.equal(D.situacaoAlvara({ vencimento: "2026-10-01" }, h).cor, "vermelho");
    assert.deepEqual([D.situacaoAlvara({ sitAlvara: "dispensado" }, h).cor, D.situacaoAlvara({ sitAlvara: "dispensado" }, h).status], ["cinza", "na"]);
    assert.equal(D.situacaoAlvara({ sitAlvara: "vencido" }, h).status, "vencido");
    assert.equal(D.situacaoAlvara({ sitAlvara: "renovado" }, h).texto, "Renovado, falta a data");
    assert.equal(D.situacaoAlvara({ sitAlvara: "solicitado", vencimento: "2026-10-01" }, h).cor, "amarelo");
    assert.equal(D.tipoDeAlvara("Alvará de funcionamento"), "Alvará municipal");
    assert.equal(D.normalizarTipo("ALVARA BOMBEIRO").tipo, "Alvará dos Bombeiros");
  });
  test("planilha de renovação: CNPJ é a chave (filiais com o mesmo nome), grade e reimportação", () => {
    const abas = [{ nome: "ALVARÁS 2026", rows: [["Razão social", "CNPJ", "Cidade", "UF", "ENVIADA TAXAS", "NOME", "RESPONSÁVEL", "MUNICIPAL", "SANITARIO", "BOMBEIRO"],
      ["Alfa Ltda", "11.111.111/0001-11", "TUBARAO", "SC", "OK ACESSORIAS", "", "ANA", new Date(2026, 11, 31), "DISPENSADO", "22.04.2027"],
      ["Alfa Ltda", "11.111.111/0002-00", "LAGUNA", "SC", "", "", "ANA", "VENCIDO", "", "NÃO POSSUI"],
      ["Beta Ltda", "22.222.222/0001-22", "TUBARAO", "SC", "", "", "BRUNO", "RENOVADO", "SOLICITADO", ""]] }];
    const p = D.lerPlanilhaCadastro(abas, Core.toIsoDate, 2026);
    assert.deepEqual(p.abas.map((a) => [a.tipo, a.linhas]), [["alvaras", 3]]);
    assert.equal(p.empresas.length, 3, "matriz e filial com o mesmo nome ficam separadas");
    assert.equal(p.alvaras.length, 7);
    const { svc } = amb();
    assert.deepEqual(svc.previaPlanilha(p), { novas: 3, existentes: 0, semCnpj: 0, alvaras: 7 });
    const r = svc.aplicarPlanilha(p);
    assert.deepEqual([r.novasEmp, r.alvNovos], [3, 7]);
    const g = svc.gradeAlvaras();
    const filial = g.linhas.find((l) => l.empresa.documento === "11.111.111/0002-00");
    assert.equal(filial.empresa.cidade, "LAGUNA");
    assert.deepEqual(D.ALVARAS_GRADE.map((t) => filial.situacoes[t].cor), ["vermelho", "branco", "amarelo"]);
    const matriz = g.linhas.find((l) => l.empresa.documento === "11.111.111/0001-11");
    assert.deepEqual(D.ALVARAS_GRADE.map((t) => matriz.situacoes[t].cor), ["verde", "cinza", "verde"]);
    assert.equal(matriz.responsavel, "ANA"); assert.equal(matriz.empresa.envioTaxas, "OK ACESSORIAS");
    // nova planilha: municipal da matriz renovado para 2027 (o anterior vai para o histórico); não duplica empresas
    abas[0].rows[1][7] = new Date(2027, 11, 31);
    const r2 = svc.aplicarPlanilha(D.lerPlanilhaCadastro(abas, Core.toIsoDate, 2026));
    assert.deepEqual([r2.novasEmp, r2.alvNovos, r2.alvAtualizados], [0, 0, 7]);
    const mun = svc.gradeAlvaras().linhas.find((l) => l.empresa.documento === "11.111.111/0001-11").alvaras["Alvará municipal"];
    assert.equal(mun.vencimento, "2027-12-31"); assert.equal(mun.historico[0].vencimentoAnterior, "2026-12-31");
    // o alvará "vencido" sem data entra nos avisos e no número do menu
    assert.ok(svc.avisos().lista.some((d) => d.tipo === "Alvará municipal" && d.situacao.status === "vencido"));
  });
  test("alvará sem data precisa de situação; filial com o mesmo nome pode ser cadastrada", () => {
    const { svc } = amb({ "painelVencimentos:v1": painelAntigo() });
    assert.throws(() => svc.salvarDocumento({ clienteId: "c1", tipo: "Alvará sanitário" }), /situação/);
    assert.equal(svc.salvarDocumento({ clienteId: "c1", tipo: "Alvará sanitário", sitAlvara: "dispensado" }).sitAlvara, "dispensado");
    assert.equal(svc.salvarDocumento({ clienteId: "c1", tipo: "CND Federal", sitAlvara: "dispensado", vencimento: "2027-01-01" }).sitAlvara, "");
    assert.equal(svc.salvarEmpresa({ nome: "Empresa Exemplo Ltda", documento: "11.111.111/0002-92" }).nome, "Empresa Exemplo Ltda");
    assert.throws(() => svc.salvarEmpresa({ nome: "Empresa Exemplo Ltda" }), /Já existe/);
  });
});
