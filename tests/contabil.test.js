// Integração contábil em React (src/lib/contabil.mjs): contas, lançamentos, cadastros, competência,
// importação, extratos, distribuição e backup. Dados fictícios.
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../src/legado/core.js");
const Integracao = require("../src/legado/integracao.js");
const Importacao = require("../src/legado/importacao.js");
const Extratos = require("../src/legado/extratos.js");

let C;
before(async () => { C = await import("../src/lib/contabil.mjs"); });

function ambiente(inicial = {}) {
  const dados = {}, ls = Object.assign({}, inicial.ls);
  Object.assign(dados, inicial.dados);
  const Store = {
    get: (k) => (k in dados ? JSON.parse(JSON.stringify(dados[k])) : undefined),
    set: (k, v) => { dados[k] = JSON.parse(JSON.stringify(v)); return Promise.resolve(true); },
    remove: (k) => { delete dados[k]; return Promise.resolve(true); },
    keys: () => Object.keys(dados)
  };
  const lsApi = { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } };
  let mudancas = 0;
  const svc = C.criarContabil({ Store, ls: lsApi, Core, Integracao, Importacao, Extratos,
    agora: () => new Date("2026-10-19T10:00:00"), aoMudar: () => { mudancas++; } });
  return { svc, dados, ls, mudancas: () => mudancas };
}
const L = (o) => Object.assign({ data: "2026-09-10", desc: "PIX RECEBIDO", valorNum: 100, sign: "C", categoria: "", unidade: "" }, o);

describe("competência", () => {
  test("sem escolha, é o mês de hoje; a lista traz o atual, o anterior e os que têm dados", () => {
    const { svc } = ambiente({ dados: { "lancamentos:2026-07:banco-1": [L({})], "lancamentos:2026-06:banco-1": [] } });
    assert.equal(svc.competencia(), "2026-10");
    assert.deepEqual(svc.listaCompetencias().map((m) => [m.mes, m.vazio]), [["2026-10", true], ["2026-09", true], ["2026-07", false]]);
    assert.equal(svc.listaCompetencias()[2].nome, "Julho de 2026");
  });
  test("trocar grava no mesmo lugar da versão HTML e recusa formato errado", () => {
    const { svc, ls } = ambiente();
    assert.equal(svc.definirCompetencia("09/2026"), false);
    assert.ok(svc.definirCompetencia("2026-09"));
    assert.equal(ls.competencia, "2026-09");
  });
});

describe("contas bancárias", () => {
  test("cria no padrão das abas da planilha e não repete a conta contábil", () => {
    const { svc, ls } = ambiente();
    const c = svc.criarConta({ banco: "Sicoob", numero: "24402-3", contabil: "643" });
    assert.equal(c.sheetName, "SICOOB 24402-3 Conta 643");
    assert.equal(JSON.parse(ls.system_banks).length, 1);
    assert.equal(svc.item(c.id).tipo, "banco");
    assert.throws(() => svc.criarConta({ banco: "Itaú", numero: "1", contabil: "643" }), /já é da conta SICOOB/);
    assert.throws(() => svc.criarConta({ banco: "Itaú", numero: "1", contabil: "64a" }), /só números/);
    assert.throws(() => svc.criarConta({ banco: "Itaú", numero: "", contabil: "1" }), /número da conta/);
  });
  test("conta antiga sem conta contábil: tira do nome", () => {
    const { svc } = ambiente({ ls: { system_banks: JSON.stringify([{ id: "b1", bank: "SICREDI", label: "19915-0 Conta 627", sheetName: "SICREDI 19915-0 Conta 627" }]) } });
    assert.equal(svc.bancos()[0].contaContabil, "627");
  });
  test("excluir apaga os lançamentos de todos os meses", () => {
    const { svc, dados } = ambiente();
    const c = svc.criarConta({ banco: "Sicoob", numero: "1", contabil: "10" });
    dados["lancamentos:2026-08:" + c.id] = [L({})];
    dados["lancamentos:2026-09:" + c.id] = [L({})];
    svc.excluirConta(c.id);
    assert.deepEqual(Object.keys(dados), []);
    assert.equal(svc.bancos().length, 0);
  });
  test("conta contábil do Pagamento em dinheiro fica separada", () => {
    const { svc, ls } = ambiente();
    svc.definirContaContabil("mov-dinheiro", "5");
    assert.deepEqual(JSON.parse(ls.system_mov_contas), { "mov-dinheiro": "5" });
    assert.equal(svc.item("mov-dinheiro").contaContabil, "5");
    assert.throws(() => svc.definirContaContabil("mov-juros", "5"), /não entra/);
  });
});

describe("lançamentos", () => {
  test("adicionar, editar (tira a sugestão e o valor inválido) e validar", () => {
    const { svc } = ambiente({ ls: { competencia: "2026-09" } });
    const c = svc.criarConta({ banco: "Sicoob", numero: "1", contabil: "10" });
    assert.throws(() => svc.salvarLancamento(c.id, { data: "2026-09-01", desc: "", valorNum: 5 }), /Preencha/);
    const e = svc.salvarLancamento(c.id, { data: "2026-09-01", dataMov: "2026-09-02", desc: " TARIFA ", valorNum: -12.5, sign: "D" });
    assert.equal(e.desc, "TARIFA"); assert.equal(e.valorNum, 12.5); assert.equal(e.dataMov, "2026-09-02");
    svc.salvarLancamentos(c.id, [Object.assign({}, e, { sugerido: true, valorInvalido: true })]);
    const ed = svc.salvarLancamento(c.id, { data: "2026-09-01", desc: "TARIFA", valorNum: 12.5, sign: "D", categoria: "Despesa" }, e.id);
    assert.equal(ed.sugerido, false); assert.equal(ed.valorInvalido, false); assert.equal(ed.categoria, "Despesa");
    assert.equal(svc.lancamentos(c.id).length, 1);
  });
  test("excluir com desfazer volta para o mesmo lugar", () => {
    const { svc } = ambiente({ ls: { competencia: "2026-09" } });
    svc.salvarLancamentos("mov-juros", [L({ id: "a" }), L({ id: "b" }), L({ id: "c" })]);
    const desfazer = svc.excluirLancamento("mov-juros", "b");
    assert.deepEqual(svc.lancamentos("mov-juros").map((x) => x.id), ["a", "c"]);
    desfazer();
    assert.deepEqual(svc.lancamentos("mov-juros").map((x) => x.id), ["a", "b", "c"]);
  });
  test("totais, sugestões confirmadas e conta pela natureza", () => {
    const { svc } = ambiente({ ls: { competencia: "2026-09" }, dados: { "cadastro:cad-plano": [{ nome: "Viagens e Estadas", linha: ["Viagens e Estadas", 499] }] } });
    svc.salvarLancamentos("mov-juros", [L({ valorNum: 100 }), L({ valorNum: 30, sign: "D", categoria: "Despesa", sugerido: true })]);
    assert.deepEqual(svc.totais(svc.lancamentos("mov-juros")), { qtd: 2, creditos: 100, debitos: 30, saldo: 70, pendentes: 1, sugeridos: 1 });
    assert.equal(svc.confirmarSugestoes("mov-juros"), 1);
    assert.equal(svc.lancamentos("mov-juros")[1].sugerido, undefined);
    assert.equal(svc.contaDaNatureza("viagens e estadas"), "499");
    assert.equal(svc.contaDaNatureza("outra"), "");
  });
});

describe("cadastros", () => {
  test("do zero: colunas padrão, nome pela primeira coluna, sem repetir", () => {
    const { svc, dados } = ambiente();
    assert.deepEqual(svc.colunasDoCadastro("cad-plano"), ["Natureza", "Conta contábil"]);
    const it = svc.salvarItemCadastro("cad-plano", ["Viagens e Estadas", "499"]);
    assert.equal(it.nome, "Viagens e Estadas");
    assert.deepEqual(dados["cabecalho:cad-plano"], ["Natureza", "Conta contábil"]);
    assert.throws(() => svc.salvarItemCadastro("cad-plano", ["viagens e estadas", "1"]), /Já existe "Viagens e Estadas"/);
    assert.throws(() => svc.salvarItemCadastro("cad-plano", ["", ""]), /Preencha o campo Natureza/);
    const ed = svc.salvarItemCadastro("cad-plano", ["Viagens e Estadas", "500"], it.id);
    assert.deepEqual(ed.linha, ["Viagens e Estadas", "500"]);
  });
  test("editar mantém as colunas que não aparecem no formulário", () => {
    const cab = ["Nome"].concat(Array.from({ length: 14 }, (_, i) => "C" + i));
    const linha = ["Fornecedor Exemplo"].concat(Array.from({ length: 14 }, (_, i) => "v" + i));
    const { svc } = ambiente({ dados: { "cabecalho:cad-fornecedores": cab, "cadastro:cad-fornecedores": [{ id: "f1", nome: "Fornecedor Exemplo", linha }] } });
    assert.equal(svc.colunasDoCadastro("cad-fornecedores").length, 12);
    const ed = svc.salvarItemCadastro("cad-fornecedores", ["Fornecedor Exemplo Ltda"], "f1");
    assert.equal(ed.linha[14], "v13");
  });
  test("importar a aba do cadastro: soma sem repetir nomes", () => {
    const { svc } = ambiente({ dados: { "cadastro:cad-clientes": [{ id: "x", nome: "Cliente A", linha: ["Cliente A"] }] } });
    const lido = svc.lerAba("cad-clientes", [{ nome: "Outra", rows: [["a"]] }, { nome: "Clientes", rows: [["Nome", "CPF/CNPJ"], ["Cliente A", "1"], ["Cliente B", "2"]] }]);
    assert.equal(lido.aba, "Clientes"); assert.equal(lido.jaTem, 1); assert.equal(lido.itens.length, 2);
    svc.gravarAba("cad-clientes", lido, true);
    assert.deepEqual(svc.cadastro("cad-clientes").map((c) => c.nome), ["Cliente A", "Cliente B"]);
    assert.match(svc.lerAba("cad-clientes", [{ nome: "X", rows: [] }, { nome: "Y", rows: [] }]).erro, /Não encontrei a aba "Clientes"/);
  });
});

describe("importar a aba de uma conta", () => {
  test("cada lançamento vai para o mês da sua data e a competência acompanha", () => {
    const { svc } = ambiente({ ls: { competencia: "2026-10" } });
    const c = svc.criarConta({ banco: "Sicoob", numero: "24402-3", contabil: "643" });
    const rows = [["Data", "Data Mov.", "Descrição", "Valor", "Categoria", "Unidade"],
      ["01/09/2026", "", "PIX", "100,00C", "Recebimento", "Matriz"],
      ["02/09/2026", "", "TARIFA", "5,00D", "", ""],
      ["30/08/2026", "", "TED", "10,00C", "", ""]];
    const lido = svc.lerAba(c.id, [{ nome: "SICOOB 24402-3 Conta 643", rows }]);
    assert.deepEqual(lido.meses, ["2026-08", "2026-09"]);
    const msg = svc.gravarAba(c.id, lido, true);
    assert.match(msg, /3 lançamento\(s\) importado\(s\)/);
    assert.match(msg, /A competência mudou para Setembro de 2026/);
    assert.equal(svc.competencia(), "2026-09");
    assert.equal(svc.lancamentos(c.id).length, 2);
    assert.equal(svc.lancamentos(c.id, "2026-08").length, 1);
  });
});

describe("Master: distribuir e gerar TXT", () => {
  function comDados() {
    const amb = ambiente({ ls: { competencia: "2026-09" } });
    const c = amb.svc.criarConta({ banco: "Sicredi", numero: "19915-0", contabil: "627" });
    amb.svc.salvarLancamentos(c.id, [
      L({ categoria: "Recebimento", unidade: "Passo Fundo", doc: "1", nome: "CLIENTE EXEMPLO", cpf: "14580324000150", valorNum: 972.92 }),
      L({ categoria: "Despesa", unidade: "Passo Fundo", natureza: "Viagens", conta: "499", sign: "D", valorNum: 9.8 }),
      L({ categoria: "", unidade: "" })
    ]);
    return Object.assign({ conta: c }, amb);
  }
  test("painel conta classificados, pendentes e marca conta sem conta contábil", () => {
    const { svc } = comDados();
    const p = svc.painel();
    assert.equal(p.total, 3); assert.equal(p.classificados, 2); assert.equal(p.pendentes, 1); assert.equal(p.pct, 67);
    assert.equal(p.nomeMes, "Setembro de 2026");
    assert.ok(p.unidades.some((u) => u.nome === "Passo Fundo"));
    assert.equal(p.bancos[0].semConta, false);
  });
  test("distribuir cria as unidades uma vez só, mesmo com grafia diferente", () => {
    const { svc, conta } = comDados();
    const r = svc.distribuir();
    assert.equal(r.criadas, 1); assert.equal(r.total, 2);
    const u = svc.unidades()[0];
    assert.equal(u.label, "Passo Fundo");
    assert.equal(svc.lancamentos(u.id).length, 2);
    svc.salvarLancamentos(conta.id, svc.lancamentos(conta.id).map((e) => Object.assign({}, e, e.unidade ? { unidade: "passo fundo" } : {})));
    assert.equal(svc.distribuir().criadas, 0);
    assert.equal(svc.unidades().length, 1);
  });
  test("TXT pede a Tabela de unidades e gera um arquivo por unidade", () => {
    const { svc, dados } = comDados();
    assert.match(svc.preverTxts().erro, /Falta a Tabela de unidades/);
    dados["cadastro:cad-unidades"] = [{ nome: "Passo Fundo", linha: ["Passo Fundo", "00.589.066/0008-35", 160] }];
    assert.deepEqual(svc.preverTxts(), { sugeridos: 0, semConta: 0 });
    const r = svc.gerarTxts("atual");
    assert.deepEqual(r.arquivos.map((a) => a.nome), ["DESPESA_Passo_Fundo.txt", "RECEBIMENTO_Passo_Fundo.txt"]);
    const u = svc.gerarTxts("unico");
    assert.match(u.msg, /UNICO_Passo_Fundo\.txt → empresa 160/);
  });
  test("excluir unidades apaga as abas delas", () => {
    const { svc, dados } = comDados();
    svc.distribuir();
    assert.equal(svc.excluirUnidades(), 1);
    assert.ok(!Object.keys(dados).some((k) => /unid-/.test(k)));
  });
});

describe("planilha do mês inteira", () => {
  test("cria as contas na ordem das abas, grava cadastros e distribui", () => {
    const { svc } = ambiente();
    const antiga = svc.criarConta({ banco: "Itaú", numero: "9", contabil: "900" });
    const cab = ["Data", "Data Mov.", "Descrição", "Valor", "Categoria", "Unidade"];
    const plano = Importacao.analisarPlanilha([
      { nome: "SICOOB 24402-3 Conta 643", rows: [cab, ["01/09/2026", "", "PIX", "100,00C", "Recebimento", "Matriz"]] },
      { nome: "ITAU 9 Conta 900", rows: [cab, ["02/09/2026", "", "TED", "50,00C", "", ""]] },
      { nome: "Tabela de Unidades", rows: [["Unidade", "CNPJ", "Código"], ["Matriz", "00.589.066/0001-69", 158]] }
    ]);
    const resumo = svc.resumoPlano(plano);
    assert.deepEqual(resumo.linhas.map((l) => [l.nome, l.nova || false, l.qtd]),
      [["SICOOB 24402-3 Conta 643", true, 1], ["ITAU 9 Conta 900", false, 1], ["Cadastro: Tabela de unidades", false, 1]]);
    const msg = svc.aplicarPlanilha(plano, "2026-09", true);
    assert.match(msg, /2 lançamentos de 2 contas \(1 novas\), já distribuídos/);
    assert.deepEqual(svc.bancos().map((b) => b.contaContabil), ["643", "900"]);
    assert.equal(svc.bancos()[1].id, antiga.id);
    assert.equal(svc.tabelaUnidades().length, 1);
    assert.equal(svc.unidades()[0].label, "Matriz");
    assert.throws(() => svc.aplicarPlanilha(plano, "", true), /competência/);
  });
});

describe("extratos do banco", () => {
  test("acha a conta pelo número, não duplica e sugere pelo histórico", () => {
    const { svc } = ambiente({ ls: { competencia: "2026-10" } });
    const c = svc.criarConta({ banco: "Sicoob", numero: "24402-3", contabil: "643" });
    svc.salvarLancamentos(c.id, [L({ id: "h1", data: "2026-08-05", desc: "ENERGIA ELETRICA", nome: "ENERGIA EXEMPLO SA", valorNum: 80, sign: "D", categoria: "Despesa", unidade: "Matriz", natureza: "Energia", conta: "300" })], "2026-08");
    const itens = [
      { data: "2026-09-05", desc: "ENERGIA ELETRICA", nome: "Energia Exemplo SA", valorNum: 82, sign: "D" },
      { data: "2026-09-06", desc: "PIX RECEBIDO", valorNum: 10, sign: "C" }
    ];
    const [l] = svc.prepararExtratos([{ arquivo: "extrato.ofx", numeroConta: "244023", itens }]);
    assert.equal(l.contaId, c.id);
    assert.deepEqual(svc.previaExtrato(l), { novos: 2, repetidos: 0, meses: ["2026-09"] });
    const r = svc.confirmarExtratos([l]);
    assert.equal(r.total, 2); assert.equal(svc.competencia(), "2026-09");
    assert.match(r.msg, /O mês de trabalho mudou para Setembro de 2026/);
    const energia = svc.lancamentos(c.id).find((e) => e.desc === "ENERGIA ELETRICA");
    assert.equal(energia.sugerido, true); assert.equal(energia.categoria, "Despesa");
    assert.equal(svc.confirmarExtratos([l]).repetidos, 2, "o mesmo extrato de novo não duplica");
    assert.equal(svc.lancamentos(c.id).length, 2);
  });
});

describe("zerar, apagar e backup", () => {
  test("zerar o mês mantém os outros meses e os cadastros", async () => {
    const { svc, dados } = ambiente({ ls: { competencia: "2026-09" }, dados: {
      "lancamentos:2026-09:b": [L({}), L({})], "lancamentos:2026-08:b": [L({})], "cadastro:cad-clientes": [{ nome: "X" }] } });
    const z = svc.zerarMes();
    assert.equal(z.qtd, 2); assert.equal(z.nome, "Setembro de 2026");
    await z.executar();
    assert.deepEqual(Object.keys(dados).sort(), ["cadastro:cad-clientes", "lancamentos:2026-08:b"]);
  });
  test("backup no formato da versão HTML, sem os usuários, e restaura", async () => {
    const a = ambiente({ ls: { competencia: "2026-09", system_banks: "[]" }, dados: { "lancamentos:2026-09:b": [L({})], "auth:usuarios": [{ id: 1 }] } });
    const b = a.svc.backup({ "emDia:v1": "{}" });
    assert.equal(b.app, "gestao-financeira"); assert.equal(b.formato, 1);
    assert.ok(!("auth:usuarios" in b.dados));
    assert.equal(b.config.competencia, "2026-09");
    const outro = ambiente({ dados: { "auth:usuarios": [{ id: 2 }], "lancamentos:2026-01:z": [] } });
    let modulos = null;
    const r = outro.svc.lerBackup(JSON.stringify(b));
    await r.aplicar((m) => { modulos = m; });
    assert.deepEqual(Object.keys(outro.dados).sort(), ["auth:usuarios", "lancamentos:2026-09:b"]);
    assert.deepEqual(outro.dados["auth:usuarios"], [{ id: 2 }], "os usuários deste navegador ficam");
    assert.equal(outro.ls.competencia, "2026-09");
    assert.deepEqual(modulos, { "emDia:v1": "{}" });
    assert.throws(() => outro.svc.lerBackup("{}"), /não é um backup deste sistema/);
    assert.throws(() => outro.svc.lerBackup("xx"), /não é um backup válido/);
  });
  test("apagar tudo deixa só os usuários", async () => {
    const { svc, dados, ls } = ambiente({ ls: { system_banks: "[]", competencia: "2026-09", tema: "dark" }, dados: { "auth:x": 1, "cadastro:y": [] } });
    await svc.apagarTudo();
    assert.deepEqual(Object.keys(dados), ["auth:x"]);
    assert.deepEqual(Object.keys(ls), ["tema"]);
  });
  test("cada gravação avisa as telas", () => {
    const { svc, mudancas } = ambiente();
    const antes = mudancas();
    svc.criarConta({ banco: "Inter", numero: "1", contabil: "77" });
    svc.salvarLancamentos("mov-juros", []);
    assert.ok(mudancas() >= antes + 2);
  });
});
