/*
 * Gera dist/sw.js no build: o modelo pwa/sw.js com a versão e a lista de arquivos daquele build
 * (os do Vite, com hash no nome, e os da pasta public/: ícones, manifest e os módulos).
 * A versão é a do package.json + um resumo do conteúdo, então muda sozinha quando qualquer arquivo muda.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Arquivos de uma pasta (recursivo), com caminho relativo e "/". */
export function listarPasta(pasta) {
  const out = [];
  (function andar(p) {
    for (const nome of readdirSync(p)) {
      if (nome.startsWith(".")) continue;
      const c = join(p, nome);
      if (statSync(c).isDirectory()) andar(c); else out.push(relative(pasta, c).split(sep).join("/"));
    }
  })(pasta);
  return out.sort();
}

/**
 * Monta o conteúdo do sw.js. arquivos: [{ caminho, conteudo }] (conteúdo para o resumo da versão).
 * Pastas de módulo (modulos/x/index.html) também entram como "modulos/x/", que é como o quadro abre.
 */
export function montarSw(modelo, versaoPacote, arquivos) {
  const hash = createHash("sha256");
  const lista = ["./"];
  arquivos.slice().sort((a, b) => a.caminho.localeCompare(b.caminho)).forEach((a) => {
    hash.update(a.caminho); hash.update(a.conteudo);
    if (a.caminho === "index.html" || a.caminho === "sw.js") return;
    lista.push(a.caminho);
    const m = /^(modulos\/[^/]+\/)index\.html$/.exec(a.caminho);
    if (m) lista.push(m[1]);
  });
  const versao = versaoPacote + "-" + hash.digest("hex").slice(0, 8);
  return { versao, lista, codigo: modelo.replace('var VERSAO = "__VERSAO__";', "var VERSAO = " + JSON.stringify(versao) + ";")
    .replace("var ARQUIVOS = __ARQUIVOS__;", "var ARQUIVOS = " + JSON.stringify(lista, null, 1) + ";") };
}

export default function pluginSw() {
  let config;
  return {
    name: "gestao-financeira-sw",
    apply: "build",
    configResolved(c) { config = c; },
    generateBundle(_, bundle) {
      const arquivos = Object.values(bundle).map((b) => ({ caminho: b.fileName, conteudo: b.type === "chunk" ? b.code : b.source }));
      if (config.publicDir) {
        for (const c of listarPasta(config.publicDir)) arquivos.push({ caminho: c, conteudo: readFileSync(join(config.publicDir, c)) });
      }
      const modelo = readFileSync(new URL("./sw.js", import.meta.url), "utf8");
      const pkg = JSON.parse(readFileSync(join(config.root, "package.json"), "utf8"));
      const r = montarSw(modelo, pkg.version, arquivos);
      this.emitFile({ type: "asset", fileName: "sw.js", source: r.codigo });
      this.info && this.info("sw.js " + r.versao + ": " + r.lista.length + " arquivos para abrir sem internet");
    }
  };
}
