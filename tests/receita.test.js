// Consulta do CNPJ na Receita (BrasilAPI): validação, leitura da resposta e junção com o cadastro. Dados fictícios.
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

let R;
test.before(async () => { R = await import("../src/lib/receita.mjs"); });

// resposta no formato da BrasilAPI (campos fictícios)
const RESPOSTA = {
  cnpj: "11222333000181", identificador_matriz_filial: 1, descricao_matriz_filial: "MATRIZ",
  razao_social: "EMPRESA EXEMPLO LTDA", nome_fantasia: "EXEMPLO", descricao_situacao_cadastral: "ATIVA", data_situacao_cadastral: "2015-03-10",
  data_inicio_atividade: "2015-03-10", cnae_fiscal: 6920601, cnae_fiscal_descricao: "Atividades de contabilidade",
  descricao_tipo_logradouro: "RUA", logradouro: "DAS FLORES", numero: "100", complemento: "SALA 2", bairro: "CENTRO", cep: "88701000",
  uf: "SC", municipio: "TUBARAO", ddd_telefone_1: "4836260000", opcao_pelo_simples: true, opcao_pelo_mei: false,
  qsa: [{ nome_socio: "ANA DE SOUZA", qualificacao_socio: "Sócio-Administrador", data_entrada_sociedade: "2015-03-10" }, { nome_socio: "BRUNO LIMA" }]
};

describe("CNPJ", () => {
  test("dígitos verificadores", () => {
    assert.equal(R.cnpjValido("11.222.333/0001-81"), true);
    assert.equal(R.cnpjValido("11222333000181"), true);
    assert.equal(R.cnpjValido("11.222.333/0001-82"), false);
    assert.equal(R.cnpjValido("00000000000000"), false, "todos iguais não vale");
    assert.equal(R.cnpjValido("123"), false);
    assert.equal(R.formatarCnpj("11222333000181"), "11.222.333/0001-81");
  });
  test("telefone e nome próprio", () => {
    assert.equal(R.formatarTelefone("4836260000"), "(48) 3626-0000");
    assert.equal(R.formatarTelefone("48999990000"), "(48) 99999-0000");
    assert.equal(R.nomeProprio("ANA DE SOUZA"), "Ana de Souza");
  });
});

describe("resposta da Receita", () => {
  test("vira os campos do cadastro", () => {
    const d = R.daReceita(RESPOSTA);
    assert.equal(d.documento, "11.222.333/0001-81");
    assert.equal(d.nome, "EMPRESA EXEMPLO LTDA");
    assert.equal(d.cidade, "TUBARAO");
    assert.equal(d.cnae, "6920-6/01 Atividades de contabilidade");
    assert.equal(d.endereco, "RUA DAS FLORES, 100, SALA 2, CENTRO");
    assert.equal(d.telefone, "(48) 3626-0000");
    assert.equal(d.regime, "Simples Nacional");
    assert.equal(d.matriz, true);
    assert.deepEqual(d.socios.map((s) => s.nome), ["Ana de Souza", "Bruno Lima"]);
    assert.equal(R.daReceita(Object.assign({}, RESPOSTA, { opcao_pelo_mei: true })).regime, "MEI");
    assert.equal(R.daReceita(Object.assign({}, RESPOSTA, { opcao_pelo_simples: false })).regime, "", "Presumido/Real a Receita não informa");
  });
  test("situação diferente de ATIVA pede atenção", () => {
    assert.equal(R.situacaoPedeAtencao("ATIVA"), false);
    assert.equal(R.situacaoPedeAtencao("BAIXADA"), true);
    assert.equal(R.situacaoPedeAtencao("inapta"), true);
    assert.equal(R.situacaoPedeAtencao(""), false);
  });
  test("completar só preenche o vazio; a situação sempre atualiza", () => {
    const atual = { nome: "Exemplo (nome da equipe)", documento: "11222333000181", telefone: "", regime: "Lucro Presumido", situacaoReceita: "SUSPENSA" };
    const { dados, preenchidos } = R.completarComReceita(atual, R.daReceita(RESPOSTA));
    assert.equal(dados.nome, "Exemplo (nome da equipe)");
    assert.equal(dados.regime, "Lucro Presumido");
    assert.equal(dados.telefone, "(48) 3626-0000");
    assert.equal(dados.situacaoReceita, "ATIVA");
    assert.ok(preenchidos.includes("telefone") && preenchidos.includes("cnae") && !preenchidos.includes("nome"));
  });
});

describe("consulta", () => {
  const resp = (status, corpo) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
  test("chama a BrasilAPI só com os números e devolve o cadastro", async () => {
    let url = "";
    const d = await R.consultarCnpj("11.222.333/0001-81", { fetch: async (u) => { url = u; return resp(200, RESPOSTA)(); } });
    assert.equal(url, "https://brasilapi.com.br/api/cnpj/v1/11222333000181");
    assert.equal(d.nome, "EMPRESA EXEMPLO LTDA");
  });
  test("mensagens de erro para a pessoa", async () => {
    await assert.rejects(R.consultarCnpj("123", { fetch: resp(200, {}) }), /CNPJ inválido/);
    await assert.rejects(R.consultarCnpj("11222333000181", { fetch: resp(404, {}) }), /não encontrado/);
    await assert.rejects(R.consultarCnpj("11222333000181", { fetch: resp(429, {}) }), /Espere um minuto/);
    await assert.rejects(R.consultarCnpj("11222333000181", { fetch: resp(500, {}) }), /erro 500/);
    await assert.rejects(R.consultarCnpj("11222333000181", { fetch: async () => { throw new TypeError("Failed to fetch"); } }), /Sem conexão/);
  });
});
