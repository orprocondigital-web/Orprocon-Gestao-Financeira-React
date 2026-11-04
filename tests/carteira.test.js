// Carteira do usuário (src/lib/carteira.mjs): quais empresas cada pessoa vê. Nomes e CNPJs fictícios.
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

let C;
before(async () => { C = await import("../src/lib/carteira.mjs"); });

const empresas = [
  { id: "a", nome: "Alfa Comércio Ltda", documento: "11.222.333/0001-81", codigo: "023", departamentos: ["Departamento Pessoal", "Departamento Contábil"] },
  { id: "b", nome: "Beta Serviços ME", documento: "11.444.777/0001-61", codigo: "759", departamentos: ["Departamento Contábil"] },
  { id: "c", nome: "Gama Indústria SA", documento: "45.723.174/0001-10", codigo: "1069", departamentos: ["Depto Fiscal"] },
  { id: "d", nome: "Sem Departamento Ltda", documento: "12.345.678/0001-95" }
];
const usuarios = [
  { id: "u1", nome: "Mario Henrique Ceolin de Bona", email: "mario@exemplo.com", perfil: "usuario" },
  { id: "u2", nome: "Ana Paula Souza", email: "ana@exemplo.com", perfil: "usuario" },
  { id: "u3", nome: "Ana Lima", email: "ana.lima@exemplo.com", perfil: "usuario" }
];
const vistos = (filtro) => empresas.filter((e) => !filtro || filtro(e)).map((e) => e.id);

describe("quem vê o quê", () => {
  test("sem setor e sem carteira, ou admin: vê todas (sem filtro)", () => {
    assert.equal(C.criarFiltro({ perfil: "usuario", setores: [], carteira: [] }), null);
    assert.equal(C.criarFiltro({ perfil: "admin", setores: ["Pessoal"], carteira: ["11222333000181"] }), null);
    assert.equal(C.criarFiltro(null), null);
  });
  test("por setor: as empresas que têm o departamento (com ou sem a palavra Departamento)", () => {
    assert.deepEqual(vistos(C.criarFiltro({ perfil: "usuario", setores: ["Departamento Pessoal"] })), ["a"]);
    assert.deepEqual(vistos(C.criarFiltro({ perfil: "usuario", setores: ["contabil"] })), ["a", "b"]);
    assert.deepEqual(vistos(C.criarFiltro({ perfil: "usuario", setores: ["Departamento Fiscal"] })), ["c"]);
  });
  test("por carteira, e setor + carteira juntos", () => {
    assert.deepEqual(vistos(C.criarFiltro({ perfil: "usuario", carteira: ["11444777000161", "12345678000195"] })), ["b", "d"]);
    assert.deepEqual(vistos(C.criarFiltro({ perfil: "usuario", setores: ["Contábil"], carteira: ["11444777000161", "12345678000195"] })), ["b"]);
  });
  test("empresa de outro módulo (sem departamentos): busca o setor pelo CNPJ no cadastro", () => {
    const f = C.criarFiltro({ perfil: "usuario", setores: ["Pessoal"] }, (doc) => (doc === "11222333000181" ? ["Departamento Pessoal"] : []));
    assert.equal(f({ cnpj: "11222333000181" }), true);
    assert.equal(f({ cnpj: "11444777000161" }), false);
  });
  test("setores das empresas, sem repetir, com a contagem", () => {
    assert.deepEqual(C.setoresDasEmpresas(empresas), ["Departamento Contábil", "Departamento Pessoal", "Depto Fiscal"]);
    assert.deepEqual(C.contarPorSetor(empresas), { pessoal: 1, contabil: 2, fiscal: 1 });
  });
});

describe("importar a lista do Acessórias", () => {
  test("acha o usuário pelo nome abreviado do Acessórias, pelo e-mail e pelo nome completo", () => {
    assert.equal(C.acharUsuario("Mario H. C. Bona", usuarios).id, "u1");
    assert.equal(C.acharUsuario("MARIO BONA", usuarios).id, "u1");
    assert.equal(C.acharUsuario("ana@exemplo.com", usuarios).id, "u2");
    assert.equal(C.acharUsuario("Ana Paula Souza", usuarios).id, "u2");
    assert.equal(C.acharUsuario("Ana", usuarios), null);          // duas Anas: não arrisca
    assert.equal(C.acharUsuario("Pedro Alves", usuarios), null);
  });
  test("separa o responsável e a empresa no formato da lista de entregas", () => {
    assert.deepEqual(C.separarResponsavel("Departamento Contábil - Mario H. C. Bona"), { setor: "Departamento Contábil", nome: "Mario H. C. Bona" });
    assert.deepEqual(C.separarEmpresa("BITE AUTO PECAS LTDA (Matriz Tubarão) [759|0001-20]"), { nome: "BITE AUTO PECAS LTDA", codigo: "759", finalCnpj: "000120" });
    assert.deepEqual(C.separarEmpresa("737 PRODUÇÕES LTDA [023|0001-39]"), { nome: "737 PRODUÇÕES LTDA", codigo: "23", finalCnpj: "000139" });
  });
  test("planilha com Responsável e CNPJ", () => {
    const abas = [{ nome: "Carteiras", rows: [
      ["Responsável", "Empresa", "CNPJ"],
      ["Mario H. C. Bona", "Alfa", "11.222.333/0001-81"],
      ["Mario H. C. Bona", "Beta", "11444777000161"],
      ["Mario H. C. Bona", "Beta", "11444777000161"],
      ["ana@exemplo.com", "Gama", "45.723.174/0001-10"],
      ["Pedro Alves", "Alfa", "11.222.333/0001-81"]
    ] }];
    const r = C.lerPlanilhaCarteira(abas, usuarios, empresas);
    assert.deepEqual(r.porUsuario.map((x) => [x.usuario.id, x.cnpjs]), [["u2", ["45723174000110"]], ["u1", ["11222333000181", "11444777000161"]]]);
    assert.deepEqual(r.semUsuario, [{ nome: "Pedro Alves", empresas: 1 }]);
    assert.equal(r.linhas, 5);
  });
  test("exportação da lista de entregas do Acessórias: empresa [ID|final do CNPJ] e Departamento - Responsável", () => {
    const abas = [{ nome: "Entregas", rows: [
      ["Lista de Entregas", "", ""],
      ["L Real - Preencher Planilha", "Alfa Comércio Ltda [023|0001-81]", "Departamento Contábil - Mario H. C. Bona"],
      ["Outra obrigação", "Alfa Comércio Ltda [023|0001-81]", "Departamento Contábil - Mario H. C. Bona"],
      ["L Real - Preencher Planilha", "BETA SERVICOS ME (Matriz Tubarão) [759|0001-61]", "Departamento Contábil - Mario H. C. Bona"],
      ["L Real - Preencher Planilha", "Empresa Que Não Existe [999|0001-00]", "Departamento Contábil - Mario H. C. Bona"]
    ] }];
    const r = C.lerPlanilhaCarteira(abas, usuarios, empresas);
    assert.deepEqual(r.porUsuario.map((x) => [x.usuario.id, x.cnpjs]), [["u1", ["11222333000181", "11444777000161"]]]);
    assert.deepEqual(r.semEmpresa, ["Empresa Que Não Existe [999|0001-00]"]);
  });
});
