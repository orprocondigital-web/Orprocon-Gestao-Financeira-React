// Lista de contatos do Acessórias (EmailsContatos.csv) e CNPJ novo que encontra a empresa cadastrada sem CNPJ.
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

let D;
before(async () => { D = await import("../src/lib/depCadastro.mjs"); });
function amb(inicial) {
  const ls = Object.assign({}, inicial);
  const svc = D.criarDepCadastro({ ls: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } },
    agora: () => new Date(2026, 10, 3, 10), aoMudar: () => {} });
  return { svc, ls, clientes: () => JSON.parse(ls["painelVencimentos:v1"]).clientes };
}
const CAB = ["CNPJ", "Razão Social", "Grupo de Empresas", "Telefone", "Nome", "E-mail"];
const contatos = (linhas) => [{ nome: "EmailsContatos.csv", rows: [CAB].concat(linhas) }];

describe("contatos do Acessórias", () => {
  test("cada empresa ganha todos os contatos dela; a Orprocon e a equipe ficam de fora", () => {
    const { svc, clientes } = amb();
    const p = D.lerPlanilhaCadastro(contatos([
      ["82.585.332/0001-40", "ORPROCON EMPRESA CONTABIL LTDA", "Geral", "(48) 99999-0000", "Andrei", "andrei@orprocon.com.br"],
      ["11.222.333/0001-81", "CELESP LTDA", "Geral", "", "Ana", "ana@celesp.com.br"],
      ["11.222.333/0001-81", "CELESP LTDA", "Geral", "(48) 3333-0000", "Bruno", "bruno@celesp.com.br"],
      ["11.222.333/0001-81", "CELESP LTDA", "Geral", "", "Ana", "ANA@celesp.com.br"],
      ["11.222.333/0001-81", "CELESP LTDA", "Geral", "", "Regi", "regirh@orprocon.com.br"],
      ["45.997.418/0001-53", "FAM METAL LTDA", "Geral", "", "Adriana", "adriana@orprocon.com.br"]
    ]), (v) => v, 2026);
    assert.deepEqual(p.abas.map((a) => a.tipo), ["contatos"]);
    assert.match(p.foraDaImportacao, /1 contato\(s\) da própria Orprocon e 2 contato\(s\) da equipe/);
    assert.equal(p.avisos.length, 0, "ficar de fora não é problema");
    svc.aplicarPlanilha(p);
    const [celesp, fam] = ["CELESP LTDA", "FAM METAL LTDA"].map((n) => clientes().find((c) => c.nome === n));
    assert.equal(clientes().length, 2, "a Orprocon não vira cliente");
    assert.deepEqual(celesp.contatos.map((c) => c.nome), ["Ana", "Bruno"]);
    assert.equal(celesp.email, "ana@celesp.com.br");
    assert.ok(fam, "a empresa entra mesmo se o único contato era da equipe");
    assert.ok(!(fam.contatos || []).length);
  });

  test("contatos novos somam aos que a empresa já tinha; importar de novo não muda nada", () => {
    const { svc, clientes } = amb({ "painelVencimentos:v1": JSON.stringify({ documentos: [],
      clientes: [{ id: "c1", nome: "Celesp Ltda", documento: "11.222.333/0001-81", contato: "Carla", email: "carla@celesp.com.br", telefone: "" }] }) });
    const p = D.lerPlanilhaCadastro(contatos([["11222333000181", "CELESP LTDA", "Geral", "", "Ana", "ana@celesp.com.br"],
      ["11222333000181", "CELESP LTDA", "Geral", "", "Carla", "Carla@celesp.com.br"]]), (v) => v, 2026);
    const r = svc.aplicarPlanilha(p);
    assert.equal(r.novasEmp, 0); assert.equal(r.atualizadas, 1);
    assert.deepEqual(clientes()[0].contatos.map((c) => c.nome), ["Carla", "Ana"]);
    assert.equal(clientes()[0].nome, "Celesp Ltda", "a lista de contatos não troca o nome");
    assert.equal(svc.aplicarPlanilha(p).atualizadas, 0);
  });
});

describe("CNPJ novo e empresa cadastrada sem CNPJ", () => {
  test("mesmo nome de um cliente sem CNPJ: é ele, e ganha o CNPJ (sem duplicar)", () => {
    const { svc, clientes } = amb({ "painelVencimentos:v1": JSON.stringify({ documentos: [],
      clientes: [{ id: "c1", nome: "Padaria São José", documento: "" }, { id: "c2", nome: "Outra Ltda", documento: "" }] }) });
    const p = D.lerPlanilhaCadastro(contatos([["45.997.418/0001-53", "PADARIA SAO JOSE", "Geral", "", "Zé", "ze@padaria.com"]]), (v) => v, 2026);
    const r = svc.aplicarPlanilha(p);
    assert.equal(r.novasEmp, 0);
    assert.equal(clientes().length, 2);
    assert.equal(clientes()[0].documento, "45.997.418/0001-53");
  });

  test("duas filiais com o mesmo nome não grudam na mesma empresa sem CNPJ", () => {
    const { svc, clientes } = amb({ "painelVencimentos:v1": JSON.stringify({ documentos: [], clientes: [{ id: "c1", nome: "Mitra Diocesana", documento: "" }] }) });
    const p = D.lerPlanilhaCadastro(contatos([["86.447.240/0001-54", "MITRA DIOCESANA", "Geral", "", "A", "a@mitra.org"],
      ["86.447.240/0030-99", "MITRA DIOCESANA", "Geral", "", "B", "b@mitra.org"]]), (v) => v, 2026);
    const r = svc.aplicarPlanilha(p);
    assert.equal(r.novasEmp, 1);
    assert.equal(clientes().length, 2);
  });
});
