/*
 * Conciliação: monta o resultado que a tela mostra (cruzamento automático + o que foi feito à mão),
 * os totais e os grupos manuais. Sem tela; testado em tests/conciliar.test.js.
 * As regras de cruzamento continuam em src/legado/ (Core.conciliar, Conciliacao.*) e chegam por parâmetro.
 *
 * Grupos manuais (o que a pessoa juntou ou marcou como conferido) da conciliação por conta ficam no
 * Store em "conciliacao-manual:<id da conta>", igual à versão HTML.
 */

/** Ordem na tabela: o que falta resolver primeiro. */
export const ORDEM = { so_extrato: 0, so_sistema: 1, data_diferente: 2, manual: 3, justificado: 4, ok: 5 };
export const STATUS = {
  ok: "Conciliado", data_diferente: "Data diferente", manual: "À mão", justificado: "Conferido",
  so_extrato: "Só no banco", so_sistema: "Só no sistema"
};

const cents = (x) => (x.sign === "D" ? -1 : 1) * Math.round((x.valorNum || 0) * 100);

/** Itens do extrato com o texto usado na busca e no desempate (histórico, nome, CNPJ, documento). */
export function prepararExtrato(itens, arquivo) {
  return itens.map((i) => Object.assign({}, i, {
    texto: [i.desc, i.nome, i.cpf || i.cpfCnpj, i.doc].concat(i.detalhes || []).filter(Boolean).join(" "),
    origem: arquivo || i.origem
  }));
}

/** Meses (AAAA-MM) que o extrato cobre. */
export function mesesDoExtrato(extrato) {
  return Array.from(new Set(extrato.map((e) => String(e.data).slice(0, 7)))).sort();
}

/**
 * Resultado completo para a tela.
 * p: { Core, Conciliacao, extrato, sistema, grupos, tolerancia, avulso, filtro }
 * Cada linha pendente (só no banco / só no sistema) recebe { lado: "ext"|"sis", chave } para a seleção.
 * Devolve { linhas, resumo, diferencaCents, pendentes, pct, fechado, aVencer, itemDe(lado, chave) }.
 */
export function calcular(p) {
  const { Core, Conciliacao } = p;
  let tol = parseInt(p.tolerancia, 10);
  if (isNaN(tol) || tol < 0) tol = 0;
  const filtro = String(p.filtro || "").toLowerCase().trim();
  const extratoTodo = p.extrato || [];
  let sistemaTodo = p.sistema || [];

  // títulos que vencem depois do extrato (parcelas futuras) ainda não são pendência
  let aVencer = [];
  if (p.avulso && extratoTodo.length) {
    const fim = extratoTodo.reduce((m, e) => (e.data > m ? e.data : m), "");
    const lim = new Date(Date.parse(fim + "T00:00:00Z") + tol * 86400000).toISOString().slice(0, 10);
    aVencer = sistemaTodo.filter((t) => t.data > lim);
    if (aVencer.length) sistemaTodo = sistemaTodo.filter((t) => t.data <= lim);
  }

  // chaves calculadas na lista inteira: continuam as mesmas com filtro e entre uma visita e outra
  const kE = Conciliacao.chavesUnicas(extratoTodo, Conciliacao.chaveExtrato);
  const kS = Conciliacao.chavesUnicas(sistemaTodo, Conciliacao.chaveSistema);
  const chaveDe = new Map();
  const porChave = { ext: {}, sis: {} };
  extratoTodo.forEach((e, i) => { chaveDe.set(e, kE[i]); porChave.ext[kE[i]] = e; });
  sistemaTodo.forEach((s, i) => { chaveDe.set(s, kS[i]); porChave.sis[kS[i]] = s; });
  const sep = Conciliacao.separarManuais(extratoTodo, sistemaTodo, p.grupos || [], kE, kS);

  const bate = (x, lado) => {
    if (!filtro) return true;
    const t = lado === "ext" ? String(x.texto || x.desc || "") : [x.desc, x.nome, x.cpf, x.doc].join(" ");
    return t.toLowerCase().indexOf(filtro) > -1;
  };
  const extrato = sep.extrato.filter((e) => bate(e, "ext"));
  const sistema = sep.sistema.filter((s) => bate(s, "sis"));
  const manuais = sep.linhas.filter((l) => l.extratos.some((e) => bate(e, "ext")) || l.sistemas.some((s) => bate(s, "sis")));

  const res = p.avulso ? Conciliacao.conciliarAvulso(extrato, sistema, { toleranciaDias: tol })
    : Core.conciliar(extrato, sistema, { toleranciaDias: tol });
  const dataDe = (l) => { const x = l.extrato || l.sistema || (l.extratos && l.extratos[0]) || (l.sistemas && l.sistemas[0]); return x ? x.data : ""; };
  const linhas = res.linhas.map((l) => {
    if (l.status === "so_extrato") return Object.assign({}, l, { lado: "ext", chave: chaveDe.get(l.extrato) });
    if (l.status === "so_sistema") return Object.assign({}, l, { lado: "sis", chave: chaveDe.get(l.sistema) });
    return l;
  }).concat(manuais).sort((a, b) => ORDEM[a.status] - ORDEM[b.status] || dataDe(a).localeCompare(dataDe(b)));

  const r = Object.assign({}, res.resumo);
  r.manual = manuais.filter((l) => l.status === "manual").length;
  r.justificado = manuais.filter((l) => l.status === "justificado").length;
  // na avulsa a planilha traz os valores no mesmo sinal do banco (pagamento = D dos dois lados)
  let difMan = 0;
  manuais.forEach((l) => {
    l.extratos.forEach((x) => { difMan += p.avulso ? Math.round(x.valorNum * 100) : cents(x); });
    l.sistemas.forEach((x) => { difMan -= p.avulso ? Math.round(x.valorNum * 100) : cents(x); });
  });
  const pendentes = (r.so_extrato || 0) + (r.so_sistema || 0);
  const total = linhas.length || 1;
  return {
    linhas, resumo: r, diferencaCents: (r.diferencaCents || 0) + difMan, pendentes,
    pct: Math.round((total - pendentes) / total * 100), fechado: linhas.length > 0 && pendentes === 0,
    aVencer, somaAVencer: aVencer.reduce((t, x) => t + (x.valorNum || 0), 0),
    itemDe: (lado, chave) => porChave[lado][chave]
  };
}

/** Soma com sinal (em centavos) dos itens selecionados de um lado. */
export function somaCents(itens) { return itens.reduce((t, x) => t + cents(x), 0); }

/** Grupo manual no formato da versão HTML. */
export function grupoManual(ext, sis, obs, agora = new Date()) {
  return { ext, sis, tipo: "manual", obs: obs || "", em: agora.toISOString() };
}
/** "Conferido" sem par: um grupo por item, como na versão HTML (desfazer um não desfaz os outros). */
export function gruposConferidos(ext, sis, obs, agora = new Date()) {
  const em = agora.toISOString();
  return ext.map((k) => ({ ext: [k], sis: [], tipo: "justificado", obs: obs || "", em }))
    .concat(sis.map((k) => ({ ext: [], sis: [k], tipo: "justificado", obs: obs || "", em })));
}

/** Leitura e gravação dos grupos manuais da conciliação por conta. */
export function gruposDaConta(Store, contaId) { return (contaId && Store.get("conciliacao-manual:" + contaId)) || []; }
export function salvarGruposDaConta(Store, contaId, grupos) {
  return grupos.length ? Store.set("conciliacao-manual:" + contaId, grupos) : Store.remove("conciliacao-manual:" + contaId);
}
