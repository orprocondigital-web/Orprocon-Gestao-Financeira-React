/*
 * buscaTelas.mjs — a lista de telas da busca rápida (Ctrl+K), tirada do menu lateral, e o filtro pelo texto digitado.
 * Testado em tests/buscaTelas.test.js.
 */
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Menu → lista plana { para, label, onde, icone } (as partes da Integração também). */
export function telasDoMenu(secoes) {
  const out = [{ para: "/", label: "Início", onde: "Visão geral", icone: "inicio" }];
  (secoes || []).forEach((s) => s.itens.forEach((i) => {
    out.push({ para: i.para, label: i.label, onde: s.titulo, icone: i.icone });
    (i.partes || []).forEach((p) => p.itens.forEach((x) => out.push({ para: x.para, label: x.label, onde: i.label + " › " + p.titulo, icone: x.icone })));
  }));
  return out;
}

/** Filtra pelas palavras digitadas (todas precisam aparecer no nome ou na seção); nome que começa com o texto vem antes. */
export function filtrarTelas(telas, texto) {
  const t = norm(texto).trim();
  if (!t) return telas;
  const palavras = t.split(/\s+/);
  return telas.filter((x) => { const a = norm(x.label + " " + x.onde); return palavras.every((p) => a.indexOf(p) > -1); })
    .sort((a, b) => (norm(b.label).indexOf(t) === 0) - (norm(a.label).indexOf(t) === 0));
}
