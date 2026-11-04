// Ler certificado digital (src/lib/certificado.mjs). Certificados gerados aqui mesmo, com dados fictícios.
// A leitura do .pfx só roda com o node-forge instalado (npm install node-forge --no-save); o navegador o carrega da CDN.
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

function lib(nome) { try { return require(nome); } catch (e) { return null; } }
const forge = lib("node-forge");

let C, D;
before(async () => { C = await import("../src/lib/certificado.mjs"); D = await import("../src/lib/depCadastro.mjs"); });

describe("nome do arquivo", () => {
  test("acha a senha nos padrões da pasta do escritório", () => {
    assert.equal(C.senhasDoNome("EMPRESA EXEMPLO LTDA senha.123456 val.10.09.2027.pfx")[0], "123456");
    assert.equal(C.senhasDoNome("EMPRESA EXEMPLO LTDA senha. Abc123 val. 10.09.2027.pfx")[0], "Abc123");
    assert.equal(C.senhasDoNome("Loja Exemplo senha_Pp848103 val.05.12.2026.pfx")[0], "Pp848103");
    assert.ok(C.senhasDoNome("EXEMPLO senha. Xy2026(asterisco) val. 19.05.2027.p12").includes("Xy2026*"));
    assert.ok(C.senhasDoNome("EXEMPLO senha adm123 vence 08-04-26.pfx").includes("adm123"));
    assert.ok(C.senhasDoNome("sem senha no nome.pfx").includes("123456"));
  });
  test("lê a validade escrita no nome", () => {
    assert.equal(C.validadeDoNome("X senha.1 val.10.09.2027.pfx"), "2027-09-10");
    assert.equal(C.validadeDoNome("X senha 1 vence 08-04-26.pfx"), "2026-04-08");
    assert.equal(C.validadeDoNome("X.pfx"), "");
  });
  test("separa titular e CNPJ/CPF do nome do certificado (ICP-Brasil)", () => {
    assert.deepEqual(C.titularDoCN("EMPRESA EXEMPLO LTDA:11222333000181"), { titular: "EMPRESA EXEMPLO LTDA", documento: "11222333000181" });
    assert.deepEqual(C.titularDoCN("MARIA  EXEMPLO:12345678909"), { titular: "MARIA EXEMPLO", documento: "12345678909" });
    assert.deepEqual(C.titularDoCN("Sem documento"), { titular: "Sem documento", documento: "" });
  });
});

describe("gravar no Departamento Cadastro", () => {
  const amb = (inicial) => {
    const ls = { "painelVencimentos:v1": JSON.stringify(inicial) };
    return D.criarDepCadastro({ ls: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } }, agora: () => new Date(2026, 10, 4, 10), aoMudar: () => {} });
  };
  const base = () => ({
    clientes: [
      { id: "c1", nome: "Empresa Exemplo", documento: "11.222.333/0001-81" },
      { id: "c2", nome: "Outra Exemplo", documento: "11.444.777/0001-61" },
      { id: "c3", nome: "Terceira Exemplo", documento: "45.723.174/0001-10" }
    ],
    documentos: [
      { id: "d1", clienteId: "c1", tipo: "Certificado Digital", modelo: "A1", emissao: "2025-09-10", vencimento: "2026-09-10", historico: [] },
      { id: "d3", clienteId: "c3", tipo: "Certificado Digital", modelo: "A1", vencimento: "2027-05-01", historico: [] }
    ]
  });
  const lido = (documento, vencimento, titular) => ({ ok: true, titular: titular || "TITULAR EXEMPLO", documento, emissao: "2026-09-10", vencimento });

  test("um por CNPJ/CPF: fica o de vencimento mais longe", () => {
    const u = C.unicosPorDocumento([lido("11222333000181", "2026-09-10"), lido("11222333000181", "2027-09-10"), lido("12345678909", "2027-01-02"), { ok: false, motivo: "senha" }]);
    assert.deepEqual(u.map((x) => [x.documento, x.vencimento]), [["123.456.789-09", "2027-01-02"], ["11.222.333/0001-81", "2027-09-10"]]);
  });
  test("prévia: renova, cadastra, cria empresa ou deixa como está", () => {
    const svc = amb(base());
    const p = svc.previaCertificados(C.unicosPorDocumento([
      lido("11222333000181", "2027-09-10"), lido("11444777000161", "2027-03-01"), lido("12345678909", "2027-01-02", "MARIA EXEMPLO"),
      lido("45723174000110", "2027-05-01")
    ]));
    const sit = Object.fromEntries(p.map((x) => [x.documento, x.situacao]));
    assert.deepEqual(sit, { "11.222.333/0001-81": "renovacao", "11.444.777/0001-61": "novo", "123.456.789-09": "empresa-nova", "45.723.174/0001-10": "igual" });
    assert.equal(p.find((x) => x.situacao === "renovacao").vencimentoAtual, "2026-09-10");
    assert.equal(svc.previaCertificados([lido("45723174000110", "2026-12-01")])[0].situacao, "antigo");
  });
  test("gravar: a renovação guarda o anterior no histórico e nada se repete", () => {
    const svc = amb(base());
    const lidos = C.unicosPorDocumento([lido("11222333000181", "2027-09-10"), lido("11444777000161", "2027-03-01"), lido("12345678909", "2027-01-02", "MARIA EXEMPLO"), lido("45723174000110", "2027-05-01")]);
    assert.deepEqual(svc.gravarCertificados(lidos), { renovados: 1, novos: 2, empresasNovas: 1, ignorados: 1 });
    const certs = svc.certificados().lista;
    assert.equal(certs.length, 4);
    const d1 = certs.find((d) => d.id === "d1");
    assert.equal(d1.vencimento, "2027-09-10"); assert.equal(d1.historico[0].vencimentoAnterior, "2026-09-10");
    assert.ok(svc.empresaPorDocumento("12345678909"));
    assert.deepEqual(svc.gravarCertificados(lidos), { renovados: 0, novos: 0, empresasNovas: 0, ignorados: 4 });
  });
});

describe("leitura do .pfx", { skip: !forge && "node-forge não instalado" }, () => {
  function gerarPfx(cn, senha, inicio, fim, opcoes) {
    const chaves = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = chaves.publicKey; cert.serialNumber = "01";
    cert.validity.notBefore = new Date(inicio); cert.validity.notAfter = new Date(fim);
    cert.setSubject([{ name: "commonName", value: cn }]);
    cert.setIssuer([{ name: "commonName", value: "AC EXEMPLO" }, { name: "organizationName", value: "ICP-Brasil" }]);
    cert.sign(chaves.privateKey, forge.md.sha256.create());
    const asn1 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, [cert], senha, Object.assign({ algorithm: "3des" }, opcoes));
    return Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary");
  }
  test("lê titular, CNPJ, emissão e vencimento com a senha do nome do arquivo", () => {
    const pfx = gerarPfx("EMPRESA EXEMPLO LTDA:11222333000181", "Abc123", "2026-09-10T15:00:00Z", "2027-09-10T15:00:00Z");
    const r = C.lerCertificado(forge, pfx, C.senhasDoNome("EMPRESA EXEMPLO LTDA senha. Abc123 val. 10.09.2027.pfx"));
    assert.deepEqual(r, { ok: true, titular: "EMPRESA EXEMPLO LTDA", documento: "11222333000181", emissao: "2026-09-10", vencimento: "2027-09-10", emissor: "ICP-Brasil" });
  });
  test("também abre com AES (padrão dos certificados novos)", () => {
    const pfx = gerarPfx("MARIA EXEMPLO:12345678909", "123456", "2026-01-02T12:00:00Z", "2027-01-02T12:00:00Z", { algorithm: "aes256" });
    const r = C.lerCertificado(forge, new Uint8Array(pfx), ["errada", "123456"]);
    assert.equal(r.ok, true); assert.equal(r.documento, "12345678909"); assert.equal(r.vencimento, "2027-01-02");
  });
  test("vencimento é o dia de Brasília (UTC de madrugada ainda é o dia anterior)", () => {
    const pfx = gerarPfx("EMPRESA EXEMPLO LTDA:11222333000181", "1", "2026-09-10T15:00:00Z", "2027-09-11T02:00:00Z");
    assert.equal(C.lerCertificado(forge, pfx, ["1"]).vencimento, "2027-09-10");
  });
  test("senha errada e arquivo que não é certificado", () => {
    const pfx = gerarPfx("EMPRESA EXEMPLO LTDA:11222333000181", "certa", "2026-01-01", "2027-01-01");
    assert.deepEqual(C.lerCertificado(forge, pfx, ["errada", "outra"]), { ok: false, motivo: "senha" });
    assert.deepEqual(C.lerCertificado(forge, Buffer.from("não é um pfx"), ["1"]), { ok: false, motivo: "arquivo" });
  });
});
