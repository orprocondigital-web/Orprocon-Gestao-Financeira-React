// Auditor IBS/CBS (src/lib/ibsCbs.mjs). Notas fictícias.
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const A = require("../src/lib/ibsCbs.mjs");

describe("leitura", () => {
  test("NF-e: itens com grupo IBSCBS, redução e número da nota; NFS-e: descrição do serviço", () => {
    const [[n1, nfe], [n2, nfse]] = A.xmlsDeExemplo();
    const r = A.lerXml(nfe, n1);
    assert.equal(r.erro, null);
    assert.equal(r.itens.length, 3);
    const i2 = r.itens[1];
    assert.deepEqual([i2.nfNumber, i2.nItem, i2.cst, i2.cClassTrib, i2.bc, i2.pRedAliqUf, i2.pAliqEfetUf, i2.vCbs, i2.ncm], ["9001", "2", "200", "200001", 500, 60, 0.04, 1.8, "30049099"]);
    const s = A.lerXml(nfse, n2);
    assert.deepEqual([s.itens.length, s.itens[0].desc, s.itens[0].nfNumber, s.itens[0].vCbs], [1, "Serviço exemplo de consultoria", "3021", 27]);
    assert.match(A.lerXml("<x><y/></x>", "a").erro, /Nenhum item/);
    assert.match(A.lerXml("lixo", "a").erro, /inválido/);
  });
});

describe("conferência", () => {
  const [[n1, nfe]] = A.xmlsDeExemplo();
  const itens = () => A.lerXml(nfe, n1).itens;
  test("ok, redução explicada e CBS divergente", () => {
    const [a, b, c] = itens().map(A.conferir);
    assert.equal(a.nivel, "ok");
    assert.equal(b.nivel, "ok"); assert.match(b.msgs[0].texto, /redução de alíquota de 60,00%/);
    assert.equal(c.nivel, "erro"); assert.match(c.msgs.map((m) => m.texto).join(" "), /CBS divergente: esperado R\$ 18,00/);
    assert.match(c.msgs.map((m) => m.texto).join(" "), /cClassTrib ausente/);
  });
  test("item sem grupo, item manual e calculadora", () => {
    assert.equal(A.conferir({ found: false }).nivel, "erro");
    const m = A.itemManual({ desc: "Manual", bc: "1000", pIbsUf: "0,1", pCbs: "0,9", cst: "000", cClassTrib: "000001" }, 1);
    assert.deepEqual([m.vIbs, m.vCbs, A.conferir(m).nivel], [1, 9, "ok"]);
    assert.throws(() => A.itemManual({}, 1), /descrição/);
    const c = A.calcular({ bc: "1000", pIbsUf: "0.1", pIbsMun: "0", pCbs: "0.9", vIbs: "1", vCbs: "10" });
    assert.deepEqual([c.ibs, c.cbs, c.total], [1, 9, 10]);
    assert.deepEqual(c.msgs.map((x) => x.nivel), ["ok", "erro"]);
    const t = A.csv(itens());
    assert.ok(t.startsWith("﻿Documento;Item"));
    assert.equal(t.split("\r\n").length, 4);
    assert.match(t, /"Erro";"[^"]*CBS divergente[^"]*"$/);
  });
});

describe("tabela de referência", () => {
  const linhas = [["Tabela"], ["NCM", "Descrição", "CST", "cClassTrib", "Redução (%)", "Observação"],
    ["8471.30.12", "Notebook", "000", "000001", 0, ""], ["3004", "Medicamentos", "200", "200001", "60", "Saúde"],
    ["9403", "Móveis", "000", "200001", 0, ""], ["12", "Sem CST", "", "", "", ""], ["1234567890", "x", "000", "000001", 0, ""]];
  test("lê a planilha, valida e acha por prefixo", () => {
    const r = A.lerReferencia(linhas);
    assert.equal(r.total, 3);
    assert.equal(r.avisos.length, 3, "cClassTrib de outro CST, falta CST, NCM longo");
    assert.equal(A.referenciaDoNcm(r.itens, "30049099").desc, "Medicamentos");
    assert.equal(A.referenciaDoNcm(r.itens, "84713012").ncm, "84713012");
    assert.equal(A.referenciaDoNcm(r.itens, "11111111"), null);
    assert.throws(() => A.lerReferencia([["Produto"]]), /NCM/);
  });
  test("confere cada item com a tabela e o cClassTrib com o CST", () => {
    const ref = A.lerReferencia(linhas).itens;
    const [[n1, nfe]] = A.xmlsDeExemplo();
    const [a, b, c] = A.lerXml(nfe, n1).itens.map((x) => A.conferir(x, ref));
    assert.equal(a.nivel, "ok"); assert.match(a.msgs.map((m) => m.texto).join(), /Confere com a tabela.*Notebook/);
    const fora = A.itemManual({ desc: "Z", ncm: "11111111", bc: "100", pCbs: "0,9", cst: "000", cClassTrib: "000001" }, 1);
    assert.equal(A.conferir(fora, ref).nivel, "atencao"); assert.match(A.conferir(fora, ref).msgs.map((m) => m.texto).join(), /11111111 não está na tabela/);
    assert.equal(b.nivel, "ok"); assert.match(b.msgs.map((m) => m.texto).join(), /Confere com a tabela.*Medicamentos/);
    assert.match(c.msgs.map((m) => m.texto).join(), /Diferente da tabela.*cClassTrib — \(esperado 200001\)/);
    const x = A.itemManual({ desc: "Y", bc: "100", pCbs: "0,9", cst: "000", cClassTrib: "200001" }, 1);
    assert.match(A.conferir(x).msgs.map((m) => m.texto).join(), /não pertence ao CST 000/);
    assert.match(A.csv([x]), /Motivo/);
  });
});

describe("tabela da LC 214 incluída no sistema", () => {
  const t = require("../src/lib/ibsLc214.json");
  test("formato que o auditor lê, sem aviso, com os anexos de mercadorias", () => {
    const r = A.lerReferencia([t.cabecalho].concat(t.linhas));
    assert.ok(r.total > 400, "mais de 400 NCMs");
    assert.deepEqual(r.avisos, [], "cClassTrib sempre do CST da linha");
    const ref = (n) => A.referenciaDoNcm(r.itens, n);
    assert.deepEqual([ref("10062010").cClassTrib, ref("10062010").reducao], ["200003", 100], "arroz: Anexo I");
    assert.deepEqual([ref("04011010").cClassTrib, ref("04011010").reducao], ["200003", 100], "leite: Anexo I");
    assert.equal(ref("04072100").cClassTrib, "200014", "ovos: Anexo XV");
    assert.equal(ref("34011190").cClassTrib, "200035", "sabonete: Anexo VIII");
    assert.equal(ref("30049099").cClassTrib, "200030", "substituto de enxerto ósseo: Anexo IV (mais específico que medicamentos)");
    assert.equal(ref("30049069").cClassTrib, "200032", "medicamento: art. 133, 60% (o Anexo XIV foi revogado)");
    assert.equal(ref("03021100").cClassTrib, "000001", "salmonídeo: exceção do Anexo I, tributação integral");
    assert.equal(ref("84713012"), null, "notebook: fora da tabela");
  });
  test("completar a tabela própria com a da LC 214: a própria vale mais", () => {
    const base = { "1006": { cClassTrib: "200003" }, "0401": { cClassTrib: "200003" } };
    const propria = { "1006": { cClassTrib: "200034" } };
    const j = A.mesclarReferencias(base, propria);
    assert.equal(j.itens["1006"].cClassTrib, "200034"); assert.equal(j.itens["0401"].cClassTrib, "200003");
    assert.deepEqual([j.total, j.daBase], [2, 1]);
  });
});
