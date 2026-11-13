// Busca rápida (Ctrl+K): telas do menu e filtro pelo nome.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const secoes = [
  { titulo: "Contábil", itens: [{ para: "/conciliacao", label: "Conciliação bancária", icone: "conciliacao" }, { para: "/fechamento", label: "Fechamento contábil", icone: "fechamento" }] },
  { titulo: "Fam Metal", itens: [{ para: "/fan/conciliacao", label: "Conciliação bancária", icone: "conciliacao" }] },
  { titulo: "Celesp", itens: [{ para: "/integracao", label: "Integração contábil", icone: "master", partes: [{ titulo: "Bancos", itens: [{ para: "/conta/b1", label: "Banco Exemplo", icone: "banco" }] }] }] },
  { titulo: "Departamento Pessoal", itens: [{ para: "/horas", label: "Controle de horas", icone: "horas" }] }
];

test("lista o Início, os itens e as partes da Integração", async () => {
  const { telasDoMenu } = await import("../src/lib/buscaTelas.mjs");
  const t = telasDoMenu(secoes);
  assert.equal(t.length, 7);
  assert.deepEqual(t.find((x) => x.para === "/conta/b1").onde, "Integração contábil › Bancos");
});

test("acha pela seção, sem acento, com várias palavras; quem começa com o texto vem antes", async () => {
  const { telasDoMenu, filtrarTelas } = await import("../src/lib/buscaTelas.mjs");
  const t = telasDoMenu(secoes);
  assert.deepEqual(filtrarTelas(t, "fam conc").map((x) => x.para), ["/fan/conciliacao"]);
  assert.deepEqual(filtrarTelas(t, "conciliacao").map((x) => x.para).slice(0, 2), ["/conciliacao", "/fan/conciliacao"]);
  assert.deepEqual(filtrarTelas(t, "HORAS").map((x) => x.para), ["/horas"]);
  assert.equal(filtrarTelas(t, "").length, 7);
  assert.equal(filtrarTelas(t, "zzz").length, 0);
});
