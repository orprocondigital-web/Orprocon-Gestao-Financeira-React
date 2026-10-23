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
    assert.match(t, /"Erro"$/);
  });
});
