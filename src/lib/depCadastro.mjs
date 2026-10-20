/*
 * Departamento Cadastro: certidões, alvarás (com vencimento), faturamentos e demonstrativos contábeis
 * por empresa. Substitui o Painel de vencimentos.
 *
 * As empresas, as certidões e os alvarás continuam na chave do antigo painel ("painelVencimentos:v1",
 * mesmo formato), então nada do que já foi cadastrado se perde e o Início continua lendo os vencimentos.
 * Faturamentos e demonstrativos ficam em "depCadastro:v1". Sem tela; testado em tests/depCadastro.test.js.
 */

export const CHAVE_DOCS = "painelVencimentos:v1";
export const CHAVE = "depCadastro:v1";

export const TIPOS_CERTIDOES = ["CND Federal", "CND Estadual", "CND Municipal", "CRF FGTS", "CND Trabalhista", "Certificado A1", "Procuração", "Licença"];
export const TIPOS_ALVARAS = ["Alvará de funcionamento", "Alvará sanitário", "Alvará dos Bombeiros", "Alvará ambiental"];
export const DEMONSTRATIVOS = ["Balanço Patrimonial", "DRE", "Balancete"];
export const STATUS_DEMO = [
  { id: "", nome: "Pendente" }, { id: "emitido", nome: "Emitido" }, { id: "entregue", nome: "Entregue" }, { id: "nao_se_aplica", nome: "Não se aplica" }
];
export const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const txt = (v) => (v === null || v === undefined ? "" : String(v).trim());
const iso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
export function chaveNome(s) { return txt(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " "); }

/** Certidões ou alvarás, pelo tipo do documento. */
export function grupoDoTipo(tipo) { return /^alvar/i.test(txt(tipo)) ? "alvaras" : "certidoes"; }

/** Dias até vencer e a situação: vencido, 7 (até 7 dias), 30 (até 30 dias) ou ok. */
export function situacao(vencimento, hoje) {
  if (!iso(vencimento)) return { dias: null, status: "sem" };
  const dias = Math.round((Date.parse(vencimento + "T00:00:00Z") - Date.parse(hoje + "T00:00:00Z")) / 86400000);
  return { dias, status: dias < 0 ? "vencido" : dias <= 7 ? "7" : dias <= 30 ? "30" : "ok" };
}
export function textoSituacao(s) {
  if (s.dias === null) return "Sem data";
  if (s.dias < 0) return "Venceu há " + -s.dias + (s.dias === -1 ? " dia" : " dias");
  if (s.dias === 0) return "Vence hoje";
  return "Vence em " + s.dias + (s.dias === 1 ? " dia" : " dias");
}

/** deps: { ls (localStorage), agora?, aoMudar? } */
export function criarDepCadastro(deps) {
  const { ls } = deps;
  const agora = deps.agora || (() => new Date());
  const avisar = () => { if (deps.aoMudar) deps.aoMudar(); };
  let seq = 0;
  const novoId = (p) => p + agora().getTime().toString(36) + (seq++).toString(36);
  const hoje = () => { const d = agora(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

  function ler(k, padrao) { try { const v = JSON.parse(ls.getItem(k) || "null"); return v && typeof v === "object" ? v : padrao; } catch (e) { return padrao; } }
  function gravar(k, v) { ls.setItem(k, JSON.stringify(v)); avisar(); }
  // o objeto inteiro do antigo painel é preservado (outros campos continuam como estavam)
  function docs() {
    const e = ler(CHAVE_DOCS, {});
    return Object.assign({}, e, { clientes: Array.isArray(e.clientes) ? e.clientes : [], documentos: Array.isArray(e.documentos) ? e.documentos : [] });
  }
  function dados() {
    const e = ler(CHAVE, {});
    return { faturamentos: e.faturamentos && typeof e.faturamentos === "object" ? e.faturamentos : {},
      demonstrativos: e.demonstrativos && typeof e.demonstrativos === "object" ? e.demonstrativos : {} };
  }

  // ------------------------------------------------------------ empresas
  function empresas() { return docs().clientes.slice().sort((a, b) => txt(a.nome).localeCompare(txt(b.nome), "pt-BR")); }
  function salvarEmpresa(dadosEmp, id) {
    const nome = txt(dadosEmp.nome);
    if (!nome) throw new Error("Preencha o nome da empresa.");
    const e = docs();
    const rep = e.clientes.find((c) => c.id !== id && chaveNome(c.nome) === chaveNome(nome));
    if (rep) throw new Error("Já existe a empresa \"" + rep.nome + "\".");
    let salvo;
    if (id) e.clientes = e.clientes.map((c) => (c.id === id ? (salvo = Object.assign({}, c, { nome, documento: txt(dadosEmp.documento) })) : c));
    else e.clientes = e.clientes.concat(salvo = { id: novoId("cli-"), nome, documento: txt(dadosEmp.documento), regime: "", contato: "", email: "", telefone: "" });
    gravar(CHAVE_DOCS, e);
    return salvo;
  }
  /** Só exclui empresa sem documentos (para não sumir certidão sem querer). */
  function excluirEmpresa(id) {
    const e = docs();
    const n = e.documentos.filter((d) => d.clienteId === id).length;
    if (n) throw new Error("A empresa tem " + n + " documento(s). Exclua ou mude os documentos antes.");
    e.clientes = e.clientes.filter((c) => c.id !== id);
    gravar(CHAVE_DOCS, e);
    const d = dados();
    Object.keys(d.faturamentos).forEach((ano) => { delete d.faturamentos[ano][id]; });
    Object.keys(d.demonstrativos).forEach((ano) => { delete d.demonstrativos[ano][id]; });
    gravar(CHAVE, d);
  }

  // ------------------------------------------------------------ certidões e alvarás
  /** Documentos de um grupo, com empresa e situação, vencidos primeiro. */
  function documentos(grupo) {
    const e = docs(), h = hoje();
    const nomes = {};
    e.clientes.forEach((c) => { nomes[c.id] = c.nome; });
    return e.documentos.filter((d) => grupoDoTipo(d.tipo) === grupo)
      .map((d) => Object.assign({}, d, { empresa: nomes[d.clienteId] || "(empresa excluída)", situacao: situacao(d.vencimento, h) }))
      .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)) || a.empresa.localeCompare(b.empresa, "pt-BR"));
  }
  function resumo(grupo) {
    const r = { total: 0, vencido: 0, "7": 0, "30": 0, ok: 0 };
    documentos(grupo).forEach((d) => { r.total++; r[d.situacao.status] = (r[d.situacao.status] || 0) + 1; });
    return r;
  }
  /** Vencidos ou vencendo em até 7 dias (número no menu). */
  function urgentes(grupo) { const r = resumo(grupo); return r.vencido + r["7"]; }

  function salvarDocumento(d, id) {
    const tipo = txt(d.tipo), clienteId = txt(d.clienteId);
    if (!clienteId) throw new Error("Escolha a empresa.");
    if (!tipo) throw new Error("Escolha o tipo do documento.");
    if (!iso(d.vencimento)) throw new Error("Preencha a data de vencimento.");
    if (d.emissao && !iso(d.emissao)) throw new Error("Data de emissão inválida.");
    const e = docs();
    if (!e.clientes.some((c) => c.id === clienteId)) throw new Error("Empresa não encontrada.");
    const campos = { clienteId, tipo, numero: txt(d.numero), emissao: d.emissao || "", vencimento: d.vencimento, responsavel: txt(d.responsavel), observacoes: txt(d.observacoes), link: txt(d.link) };
    if (campos.link && !/^https?:\/\//i.test(campos.link)) throw new Error("O link precisa começar com http:// ou https://");
    let salvo;
    if (id) e.documentos = e.documentos.map((x) => (x.id === id ? (salvo = Object.assign({}, x, campos)) : x));
    else e.documentos = e.documentos.concat(salvo = Object.assign({ id: novoId("doc-"), andamento: "pendente", criadoEm: hoje(), historico: [] }, campos));
    if (!salvo) throw new Error("Documento não encontrado.");
    gravar(CHAVE_DOCS, e);
    return salvo;
  }
  /** Renovação: guarda o vencimento anterior no histórico (mesmo formato do antigo painel). */
  function renovar(id, novo) {
    if (!iso(novo.vencimento)) throw new Error("Preencha o novo vencimento.");
    const e = docs();
    const d = e.documentos.find((x) => x.id === id);
    if (!d) throw new Error("Documento não encontrado.");
    if (novo.vencimento <= d.vencimento) throw new Error("O novo vencimento precisa ser depois do atual.");
    d.historico = (Array.isArray(d.historico) ? d.historico : []).concat({
      data: hoje(), vencimentoAnterior: d.vencimento, novoVencimento: novo.vencimento,
      emissaoAnterior: d.emissao || "", numeroAnterior: d.numero || "", obs: txt(novo.obs)
    });
    d.vencimento = novo.vencimento;
    if (iso(novo.emissao)) d.emissao = novo.emissao;
    if (txt(novo.numero)) d.numero = txt(novo.numero);
    d.andamento = "pendente";
    gravar(CHAVE_DOCS, e);
    return d;
  }
  function excluirDocumento(id) {
    const e = docs();
    const pos = e.documentos.findIndex((x) => x.id === id);
    if (pos < 0) return null;
    const removido = e.documentos[pos];
    e.documentos.splice(pos, 1);
    gravar(CHAVE_DOCS, e);
    return () => { const a = docs(); if (!a.documentos.some((x) => x.id === id)) { a.documentos.splice(Math.min(pos, a.documentos.length), 0, removido); gravar(CHAVE_DOCS, a); } };
  }

  // ------------------------------------------------------------ faturamentos (por empresa e mês)
  function faturamentos(ano) { return dados().faturamentos[ano] || {}; }
  /** valor: número ou null para apagar. */
  function definirFaturamento(ano, empresaId, mes, valor) {
    const d = dados();
    const a = d.faturamentos[ano] = d.faturamentos[ano] || {};
    const e = a[empresaId] = a[empresaId] || {};
    if (valor === null || valor === "" || !isFinite(valor)) delete e[mes]; else e[mes] = Math.round(valor * 100) / 100;
    if (!Object.keys(e).length) delete a[empresaId];
    gravar(CHAVE, d);
  }
  function totalAno(ano, empresaId) {
    const e = faturamentos(ano)[empresaId] || {};
    return Object.keys(e).reduce((t, m) => t + e[m], 0);
  }
  /** Últimos 12 meses até o mês informado (AAAA-MM), somando o ano anterior quando precisa. */
  function ultimos12(empresaId, ate) {
    const [a, m] = ate.split("-").map(Number);
    let t = 0;
    for (let i = 0; i < 12; i++) {
      const d = new Date(a, m - 1 - i, 1);
      const v = (faturamentos(String(d.getFullYear()))[empresaId] || {})[String(d.getMonth() + 1).padStart(2, "0")];
      if (v) t += v;
    }
    return t;
  }

  // ------------------------------------------------------------ demonstrativos (por empresa e ano)
  function demonstrativos(ano) { return dados().demonstrativos[ano] || {}; }
  function definirDemonstrativo(ano, empresaId, tipo, status) {
    if (!STATUS_DEMO.some((s) => s.id === status)) throw new Error("Situação inválida.");
    const d = dados();
    const a = d.demonstrativos[ano] = d.demonstrativos[ano] || {};
    const e = a[empresaId] = a[empresaId] || {};
    if (!status) delete e[tipo]; else e[tipo] = { status, em: hoje() };
    if (!Object.keys(e).length) delete a[empresaId];
    gravar(CHAVE, d);
  }
  function progressoDemonstrativos(ano) {
    const lista = empresas(), d = demonstrativos(ano);
    let total = 0, entregues = 0, emitidos = 0;
    lista.forEach((c) => DEMONSTRATIVOS.forEach((t) => {
      const st = ((d[c.id] || {})[t] || {}).status || "";
      if (st === "nao_se_aplica") return;
      total++;
      if (st === "entregue") entregues++;
      if (st === "emitido") emitidos++;
    }));
    return { total, entregues, emitidos, pendentes: total - entregues - emitidos };
  }

  return {
    hoje, empresas, salvarEmpresa, excluirEmpresa, documentos, resumo, urgentes, salvarDocumento, renovar, excluirDocumento,
    faturamentos, definirFaturamento, totalAno, ultimos12, demonstrativos, definirDemonstrativo, progressoDemonstrativos
  };
}
