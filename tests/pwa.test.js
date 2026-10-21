// App instalável: o sw.js gerado no build (pwa/plugin.mjs + modelo pwa/sw.js).
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let P, modelo;
before(async () => {
  P = await import("../pwa/plugin.mjs");
  modelo = fs.readFileSync(path.join(__dirname, "../pwa/sw.js"), "utf8");
});
const arq = (caminho, conteudo = "x") => ({ caminho, conteudo });

describe("sw.js gerado", () => {
  test("lista os arquivos, a raiz e a pasta de cada módulo (como o quadro abre)", () => {
    const r = P.montarSw(modelo, "1.0.0", [arq("index.html"), arq("assets/index-abc.js"), arq("modulos/em-dia/index.html"), arq("modulos/em-dia/js/app.js"), arq("sw.js")]);
    assert.deepEqual(r.lista, ["./", "assets/index-abc.js", "modulos/em-dia/index.html", "modulos/em-dia/", "modulos/em-dia/js/app.js"]);
    assert.match(r.versao, /^1\.0\.0-[0-9a-f]{8}$/);
    assert.ok(!r.codigo.includes("__VERSAO__") && !r.codigo.includes("__ARQUIVOS__"));
    assert.doesNotThrow(() => new Function(r.codigo), "o código gerado é JavaScript válido");
  });
  test("a versão muda quando qualquer arquivo muda, e só nesse caso", () => {
    const base = [arq("index.html", "a"), arq("icons/x.png", "1")];
    const v1 = P.montarSw(modelo, "1.0.0", base).versao;
    assert.equal(P.montarSw(modelo, "1.0.0", base.slice().reverse()).versao, v1);
    assert.notEqual(P.montarSw(modelo, "1.0.0", [arq("index.html", "a"), arq("icons/x.png", "2")]).versao, v1);
    assert.notEqual(P.montarSw(modelo, "1.0.0", [arq("index.html", "b"), arq("icons/x.png", "1")]).versao, v1);
  });
  test("caches com nome próprio: a versão HTML apaga os 'gestao-financeira-*' que não são dela", () => {
    const codigo = modelo.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");   // sem os comentários
    assert.match(codigo, /"gf-react-" \+ VERSAO/);
    assert.ok(!/gestao-financeira/.test(codigo));
    assert.match(codigo, /n\.indexOf\("gf-react-"\) === 0/);
  });
  test("os arquivos da pasta public entram na lista", () => {
    const lista = P.listarPasta(path.join(__dirname, "../public"));
    assert.ok(lista.includes("manifest.webmanifest"));
    assert.ok(lista.includes("icons/icon-192-v2.png"));
    assert.ok(lista.some((c) => /^modulos\/iss-tubarao\/index\.html$/.test(c)));
  });
});
