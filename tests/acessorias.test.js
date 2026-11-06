// Acessórias pela API (src/lib/acessorias.mjs): empresas do servidor entrando no Departamento Cadastro e carteira
// automática pelo responsável. Dados fictícios.
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../src/legado/core.js");

let A, D, C;
before(async () => {
  A = await import("../src/lib/acessorias.mjs");
  D = await import("../src/lib/depCadastro.mjs");
  C = await import("../src/lib/carteira.mjs");
});

const doServidor = () => [
  { cnpj: "11222333000181", razao: "Alfa Comércio Ltda", fantasia: "Alfa", regime: "Simples Nacional", uf: "sc", clienteDesde: "2020-03-01", clienteAte: null,
    departamentos: [{ nome: "Departamento Pessoal", respNome: "Ana Exemplo", respEmail: "ana@exemplo.com" }, { nome: "Departamento Contábil", respNome: "Mario Exemplo", respEmail: "mario@exemplo.com" }] },
  { cnpj: "44555666000177", razao: "Beta Serviços Ltda", regime: "Lucro Presumido", clienteDesde: "2019-01-10", clienteAte: "2026-09-30",
    departamentos: [{ nome: "Departamento Contábil", respNome: "Mario Exemplo", respEmail: "mario@exemplo.com" }, { nome: "Setor Inventado", respNome: "X", respEmail: "x@exemplo.com" }] }
];

function amb(inicial) {
  const ls = {};
  Object.keys(inicial || {}).forEach((k) => { ls[k] = JSON.stringify(inicial[k]); });
  const svc = D.criarDepCadastro({ ls: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } }, agora: () => new Date(2026, 10, 6, 14), aoMudar: () => {} });
  return { svc, ls };
}

describe("empresas do Acessórias no Departamento Cadastro", () => {
  test("viram a planilha de empresas do Acessórias (departamentos S, regime, entrada e saída)", () => {
    const [aba] = A.abaDasEmpresas(doServidor());
    const cab = aba.rows[0], l = aba.rows[1], col = (n) => cab.indexOf(n);
    assert.equal(aba.rows.length, 3);
    assert.equal(l[col("CNPJ / CPF / CAEPF")], "11222333000181");
    assert.equal(l[col("Departamento Pessoal")], "S");
    assert.equal(l[col("Departamento Contábil")], "S");
    assert.equal(l[col("Departamento Fiscal")], "");
    assert.equal(l[col("UF")], "SC");
    assert.equal(l[col("Cliente desde")], "03/2020");
    assert.equal(aba.rows[2][col("Saiu em")], "09/2026");
    assert.equal(A.colunaDoDepartamento("Pessoal"), "Departamento Pessoal");
    assert.equal(A.colunaDoDepartamento("Setor Inventado"), "");
  });
  test("entram pelo caminho da planilha: cria, atualiza o que veio e não apaga o que só existe na Central", () => {
    const { svc } = amb({ "painelVencimentos:v1": { clientes: [{ id: "c1", nome: "ALFA COMERCIO (nome antigo)", documento: "11.222.333/0001-81", obs: "anotação da Central", codigo: "15" }],
      documentos: [{ id: "d1", clienteId: "c1", tipo: "CND Federal", vencimento: "2027-01-01", historico: [] }] } });
    const plano = D.lerPlanilhaCadastro(A.abaDasEmpresas(doServidor()), Core.toIsoDate);
    const r = svc.aplicarPlanilha(plano);
    assert.equal(r.novasEmp, 1);
    assert.equal(r.atualizadas, 1);
    const alfa = svc.empresaPorDocumento("11222333000181");
    assert.equal(alfa.id, "c1", "a mesma empresa, pelo CNPJ");
    assert.equal(alfa.nome, "Alfa Comércio Ltda", "o Acessórias é a fonte do nome");
    assert.equal(alfa.obs, "anotação da Central");
    assert.equal(alfa.codigo, "15");
    assert.deepEqual(alfa.departamentos.slice().sort(), ["Contábil", "Pessoal"]);
    assert.equal(svc.documentos("certidoes").length, 1, "documentos da Central ficam");
    const beta = svc.empresaPorDocumento("44555666000177");
    assert.equal(beta.saida, "2026-09");
    assert.equal(beta.regime, "Lucro Presumido");
    // de novo, igual: nada muda, nada duplica
    const r2 = svc.aplicarPlanilha(D.lerPlanilhaCadastro(A.abaDasEmpresas(doServidor()), Core.toIsoDate));
    assert.deepEqual([r2.novasEmp, r2.atualizadas], [0, 0]);
    assert.equal(svc.empresas().length, 2);
  });
  test("quando aplicar: só depois de uma sincronização nova que deu certo", () => {
    const st = { ultimaOk: { fim: "2026-11-06T14:00:00Z" } };
    assert.equal(A.precisaAplicar(st, {}), true);
    assert.equal(A.precisaAplicar(st, { aplicadoEm: "2026-11-06T14:00:00Z" }), false);
    assert.equal(A.precisaAplicar({ ultimaOk: { fim: "2026-11-06T15:00:00Z" } }, { aplicadoEm: "2026-11-06T14:00:00Z" }), true);
    assert.equal(A.precisaAplicar({ ultimaOk: null }, {}), false);
  });
  test("responsáveis por e-mail e há quanto tempo", () => {
    const r = A.responsaveis(doServidor());
    assert.deepEqual([...r["mario@exemplo.com"].cnpjs], ["11222333000181", "44555666000177"]);
    assert.equal(r["ana@exemplo.com"].nome, "Ana Exemplo");
    const agora = new Date("2026-11-06T15:00:00Z");
    assert.equal(A.haQuanto("2026-11-06T14:59:30Z", agora), "agora há pouco");
    assert.equal(A.haQuanto("2026-11-06T14:48:00Z", agora), "há 12 min");
    assert.equal(A.haQuanto("2026-11-06T12:00:00Z", agora), "há 3 h");
    assert.equal(A.haQuanto("2026-11-05T15:00:00Z", agora), "há 1 dia");
    assert.equal(A.haQuanto("", agora), "");
  });
});

describe("carteira automática pelo Acessórias", () => {
  const ana = { perfil: "usuario", setores: [], carteira: [], carteiraAcessorias: true };
  test("antes de a lista chegar não limita; depois, vê as dela mais as exceções", () => {
    assert.equal(C.temCarteira(ana), false);
    assert.equal(C.criarFiltro(ana), null);
    const f = C.criarFiltro(Object.assign({}, ana, { carteiraResponsavel: ["11222333000181"], carteira: ["77888999000155"] }));
    assert.equal(f({ documento: "11.222.333/0001-81" }), true);
    assert.equal(f({ cnpj: "77888999000155" }), true, "exceção escolhida à mão");
    assert.equal(f({ documento: "44555666000177" }), false);
  });
  test("lista vazia do Acessórias: não vê nenhuma (só as exceções); com setor, dentro do setor", () => {
    const f = C.criarFiltro(Object.assign({}, ana, { carteiraResponsavel: [] }));
    assert.equal(f({ documento: "11222333000181" }), false);
    const g = C.criarFiltro(Object.assign({}, ana, { carteiraResponsavel: ["11222333000181", "44555666000177"], setores: ["Departamento Pessoal"] }));
    assert.equal(g({ documento: "11222333000181", departamentos: ["Pessoal"] }), true);
    assert.equal(g({ documento: "44555666000177", departamentos: ["Contábil"] }), false);
    assert.equal(C.criarFiltro(Object.assign({}, ana, { perfil: "admin", carteiraResponsavel: [] })), null, "admin vê todas");
  });
});

describe("responsáveis do Acessórias na grade do Em Dia", () => {
  test("Contábil, Fiscal e Pessoal; só grava o que mudou e guarda o histórico", async () => {
    const E = await import("../src/lib/emDia.mjs");
    assert.deepEqual(A.responsaveisPorSetor(doServidor()).map((x) => [x.cnpj, x.setorId, x.nome]),
      [["11222333000181", "dp", "Ana Exemplo"], ["11222333000181", "contabil", "Mario Exemplo"], ["44555666000177", "contabil", "Mario Exemplo"]]);
    const ls = {};
    const em = E.criarEmDia({ ls: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } }, aoMudar: () => {}, agora: () => new Date(2026, 10, 6) });
    const lista = [{ setorId: "dp", empresaId: "c1", nome: "Ana Exemplo" }, { setorId: "contabil", empresaId: "c1", nome: "Mario Exemplo" }, { setorId: "inventado", empresaId: "c1", nome: "X" }];
    assert.equal(em.definirResponsaveis(lista), 2);
    assert.equal(em.responsavel("dp", "c1"), "Ana Exemplo");
    assert.equal(em.definirResponsaveis(lista), 0, "igual: não grava de novo");
    assert.equal(em.definirResponsaveis([{ setorId: "dp", empresaId: "c1", nome: "Bia Exemplo" }]), 1);
    assert.deepEqual(em.historicoResponsavel("dp", "c1").map((h) => h.nome), ["Ana Exemplo", "Bia Exemplo"]);
  });
});
