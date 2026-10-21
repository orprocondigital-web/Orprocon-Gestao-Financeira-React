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
export const REGIMES = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI", "Imune / Isenta", "Pessoa física", "Outro"];

const txt = (v) => (v === null || v === undefined ? "" : String(v).trim());
const iso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
export function chaveNome(s) { return txt(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " "); }

/** Regime pelo texto de outra planilha ("SN", "Presumido", "L. Real"…); vazio quando não reconhece. */
export function regimePeloTexto(t) {
  const s = chaveNome(t).replace(/[.]/g, "");
  if (!s) return "";
  const certo = REGIMES.find((r) => chaveNome(r) === s);
  if (certo) return certo;
  if (/^mei\b|microempreendedor/.test(s)) return "MEI";
  if (/simples|^sn$/.test(s)) return "Simples Nacional";
  if (/presumid|^lp$/.test(s)) return "Lucro Presumido";
  if (/real|^lr$/.test(s)) return "Lucro Real";
  if (/imune|isent/.test(s)) return "Imune / Isenta";
  if (/fisica|^pf$|^cpf$/.test(s)) return "Pessoa física";
  return "";
}

/** CNPJ: os 8 primeiros dígitos são a raiz; 0001 depois da raiz é a matriz, o resto são filiais. CPF não tem filial. */
export function raizCnpj(doc) { const d = txt(doc).replace(/\D/g, ""); return d.length === 14 ? d.slice(0, 8) : ""; }
export function ehFilial(doc) { const d = txt(doc).replace(/\D/g, ""); return d.length === 14 && d.slice(8, 12) !== "0001"; }

/** A empresa é cliente na competência (AAAA-MM)? inicio e saida são AAAA-MM ou vazios. */
export function ativaNoMes(c, mes) { return !!c && (!c.inicio || c.inicio <= mes) && (!c.saida || c.saida >= mes); }

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


// ---------------------------------------------------------------- leitura de PDF de certidão / alvará

const DATA = /(\d{2})\/(\d{2})\/(\d{4})/;
const isoDe = (m) => m[3] + "-" + m[2] + "-" + m[1];
function todasDatas(t) { const out = []; const re = /(\d{2})\/(\d{2})\/(\d{4})/g; let m; while ((m = re.exec(t))) out.push({ iso: isoDe(m), pos: m.index }); return out; }
const semAcento = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Tipo do documento pelo texto (as certidões de cada órgão têm frases próprias). */
export function tipoPeloTexto(texto) {
  const t = semAcento(texto).toLowerCase();
  if (/certificado de regularidade do fgts|\bfgts\b/.test(t)) return "CRF FGTS";
  if (/debitos trabalhistas|justica do trabalho/.test(t)) return "CND Trabalhista";
  if (/tributos federais|divida ativa da uniao|receita federal/.test(t)) return "CND Federal";
  if (/alvara/.test(t)) {
    if (/sanitari/.test(t)) return "Alvará sanitário";
    if (/bombeiro/.test(t)) return "Alvará dos Bombeiros";
    if (/ambienta/.test(t)) return "Alvará ambiental";
    return "Alvará de funcionamento";
  }
  if (/procuracao/.test(t)) return "Procuração";
  if (/certificado digital|e-cnpj|icp-brasil/.test(t)) return "Certificado A1";
  if (/secretaria de estado da fazenda|fazenda estadual|estado de|estadual/.test(t)) return "CND Estadual";
  if (/prefeitura|municipio|municipal/.test(t)) return "CND Municipal";
  if (/licenca/.test(t)) return "Licença";
  return "";
}

/**
 * Texto de um PDF de certidão ou alvará → { tipo, documento (CNPJ/CPF), emissao, vencimento, numero }.
 * O que não achar fica vazio; a pessoa confere antes de salvar.
 */
export function lerCertidao(texto) {
  const t = String(texto || "").replace(/\s+/g, " ");
  const s = semAcento(t).toLowerCase();
  const doc = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/.exec(t) || /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.exec(t);
  let vencimento = "";
  const fim = /(valid[ao] ate|validade|vencimento|vence em|data de validade)[^0-9]{0,40}(\d{2}\/\d{2}\/\d{4})(\s*(a|ate)\s*(\d{2}\/\d{2}\/\d{4}))?/.exec(s);
  if (fim) vencimento = isoDe(DATA.exec(fim[5] || fim[2]));
  let emissao = "";
  const ini = /(emitid[ao]|expedicao|data de emissao|emissao|expedid[ao])[^/]{0,40}?(\d{2}\/\d{2}\/\d{4})/.exec(s);
  if (ini) emissao = isoDe(DATA.exec(ini[2]));
  if (!vencimento) {   // sem a palavra "validade": a data mais à frente que não é a emissão
    const ds = todasDatas(t).map((d) => d.iso).filter((d) => d !== emissao).sort();
    if (ds.length && (!emissao || ds[ds.length - 1] > emissao)) vencimento = ds[ds.length - 1];
  }
  const num = /(certidao n(?:[ºo°]|\.|umero)|numero da certidao|codigo de controle(?: da certidao)?|certificacao numero|n[ºo°] da certidao|alvara n(?:[ºo°]|\.|umero))\s*:?\s*([a-z0-9][a-z0-9.\-\/]{3,})/.exec(s);
  let numero = "";
  if (num) { const i = s.indexOf(num[2], num.index); numero = t.substr(i, num[2].length).toUpperCase(); }
  // nome da empresa, para cadastrar quando o CNPJ ainda não existe no sistema
  const nm = /(?:nome empresarial|razao social|nome)\s*:\s*/.exec(s);
  let nome = "";
  if (nm) nome = t.substr(nm.index + nm[0].length, 120).split(/\s+(?:CNPJ|CPF|Inscri|Endere|Ressalvad|\(|-\s)/i)[0].replace(/[.,;]+$/, "").trim();
  return { tipo: tipoPeloTexto(t), documento: doc ? doc[0] : "", nome, emissao, vencimento, numero };
}

// ---------------------------------------------------------------- leitura de planilha (Excel)

const CAB = {
  empresa: ["empresa", "cliente", "razao social", "nome", "nome da empresa"],
  documento: ["cnpj", "cpf", "cnpj/cpf", "cpf/cnpj", "documento da empresa"],
  tipo: ["tipo", "documento", "tipo de documento", "certidao", "alvara"],
  numero: ["numero", "n", "no", "nº", "numero do documento"],
  emissao: ["emissao", "data de emissao", "emitido em"],
  vencimento: ["vencimento", "validade", "data de vencimento", "vence em", "valido ate"],
  responsavel: ["responsavel"],
  regime: ["regime", "regime tributario", "tributacao", "enquadramento"],
  codigo: ["cod", "codigo", "cod empresa", "codigo da empresa"]
};
const MES_CAB = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const normCab = (v) => semAcento(v).toLowerCase().replace(/[.:]/g, "").replace(/\s+/g, " ").trim();

function mapaColunas(cab) {
  const m = {};
  cab.forEach((c, i) => {
    const n = normCab(c);
    Object.keys(CAB).forEach((k) => { if (m[k] === undefined && CAB[k].includes(n)) m[k] = i; });
    const mes = MES_CAB.findIndex((x) => n === x || n.startsWith(x + " ") || n.startsWith(x + "/") || (n.length > 3 && n.startsWith(x) && /^[a-z]+$/.test(n)));
    if (mes > -1 && m["m" + mes] === undefined) m["m" + mes] = i;
  });
  return m;
}

/**
 * Abas da planilha → o que importar: { empresas: [nome, documento], documentos: [...], faturamentos: [...], avisos, abas: [{ nome, tipo, linhas }] }.
 * toIsoDate: Core.toIsoDate (datas do Excel ou dd/mm/aaaa). ano: para faturamento quando a aba não diz o ano.
 */
export function lerPlanilhaCadastro(abas, toIsoDate, ano) {
  const plano = { empresas: [], documentos: [], faturamentos: [], avisos: [], abas: [] };
  const vistas = {};
  const empresa = (nome, documento, extra) => {
    const k = chaveNome(nome);
    if (!k) return;
    if (!vistas[k]) { vistas[k] = { nome: txt(nome), documento: txt(documento), regime: "", codigo: "" }; plano.empresas.push(vistas[k]); }
    else if (!vistas[k].documento && txt(documento)) vistas[k].documento = txt(documento);
    if (extra) ["regime", "codigo"].forEach((c) => { if (!vistas[k][c] && extra[c]) vistas[k][c] = extra[c]; });
  };
  abas.forEach((a) => {
    const rows = a.rows || [];
    let h = rows.findIndex((r, i) => i < 10 && r && r.filter((c) => txt(c)).length >= 2);
    if (h < 0) return;
    const col = mapaColunas(rows[h]);
    const meses = MES_CAB.map((_, i) => col["m" + i]).filter((x) => x !== undefined).length;
    const get = (r, k) => (col[k] === undefined ? "" : r[col[k]]);
    let tipo = "", n = 0;
    if (col.empresa === undefined) { plano.abas.push({ nome: a.nome, tipo: "ignorada", linhas: 0 }); return; }
    if (col.vencimento !== undefined) {
      tipo = "documentos";
      rows.slice(h + 1).forEach((r, i) => {
        if (!r || !txt(get(r, "empresa"))) return;
        const venc = toIsoDate(get(r, "vencimento"));
        const t = txt(get(r, "tipo"));
        if (!venc || !t) { plano.avisos.push("Aba \"" + a.nome + "\", linha " + (h + i + 2) + ": sem " + (!t ? "tipo" : "vencimento") + ", ficou de fora."); return; }
        empresa(get(r, "empresa"), get(r, "documento"));
        plano.documentos.push({ empresa: txt(get(r, "empresa")), tipo: t, numero: txt(get(r, "numero")), emissao: toIsoDate(get(r, "emissao")) || "",
          vencimento: venc, responsavel: txt(get(r, "responsavel")) });
        n++;
      });
    } else if (meses >= 6) {
      tipo = "faturamentos";
      const anoAba = (/(20\d{2})/.exec(a.nome) || /(20\d{2})/.exec(rows[h].join(" ")) || [])[1] || String(ano);
      rows.slice(h + 1).forEach((r) => {
        if (!r || !txt(get(r, "empresa")) || /^total/i.test(txt(get(r, "empresa")))) return;
        empresa(get(r, "empresa"), get(r, "documento"));
        MES_CAB.forEach((_, i) => {
          const v = get(r, "m" + i);
          const num = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
          if (txt(v) !== "" && isFinite(num)) { plano.faturamentos.push({ empresa: txt(get(r, "empresa")), ano: anoAba, mes: String(i + 1).padStart(2, "0"), valor: Math.abs(num) }); }
        });
        n++;
      });
    } else {
      tipo = "empresas";
      rows.slice(h + 1).forEach((r) => {
        if (!r || !txt(get(r, "empresa"))) return;
        empresa(get(r, "empresa"), get(r, "documento"), { regime: regimePeloTexto(get(r, "regime")), codigo: txt(get(r, "codigo")) });
        n++;
      });
    }
    plano.abas.push({ nome: a.nome, tipo, linhas: n });
  });
  return plano;
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
  /**
   * Empresas em ordem de nome, com o que se calcula do CNPJ: filial (true/false) e matrizId (a empresa
   * com a mesma raiz e 0001, quando está cadastrada).
   */
  function empresas() {
    const lista = docs().clientes.slice().sort((a, b) => txt(a.nome).localeCompare(txt(b.nome), "pt-BR"));
    const matrizes = {};
    lista.forEach((c) => { const r = raizCnpj(c.documento); if (r && !ehFilial(c.documento)) matrizes[r] = c.id; });
    return lista.map((c) => Object.assign({}, c, { regime: regimePeloTexto(c.regime) || txt(c.regime), filial: ehFilial(c.documento), matrizId: ehFilial(c.documento) ? matrizes[raizCnpj(c.documento)] || "" : "" }));
  }
  const MES = /^\d{4}-\d{2}$/;
  /** Cadastro geral: nome, CNPJ/CPF, código, regime, cliente desde (inicio) e até (saida), em AAAA-MM. */
  function salvarEmpresa(dadosEmp, id) {
    const nome = txt(dadosEmp.nome);
    if (!nome) throw new Error("Preencha o nome da empresa.");
    const campos = { nome, documento: txt(dadosEmp.documento), codigo: txt(dadosEmp.codigo), regime: txt(dadosEmp.regime), inicio: txt(dadosEmp.inicio), saida: txt(dadosEmp.saida) };
    if (campos.regime && !REGIMES.includes(campos.regime)) throw new Error("Regime inválido.");
    if ((campos.inicio && !MES.test(campos.inicio)) || (campos.saida && !MES.test(campos.saida))) throw new Error("Use mês e ano (AAAA-MM).");
    if (campos.inicio && campos.saida && campos.saida < campos.inicio) throw new Error("A saída precisa ser depois do início.");
    const e = docs();
    const rep = e.clientes.find((c) => c.id !== id && chaveNome(c.nome) === chaveNome(nome));
    if (rep) throw new Error("Já existe a empresa \"" + rep.nome + "\".");
    const dig = campos.documento.replace(/\D/g, "");
    const mesmoDoc = dig.length >= 11 && e.clientes.find((c) => c.id !== id && txt(c.documento).replace(/\D/g, "") === dig);
    if (mesmoDoc) throw new Error("O CNPJ/CPF já está em \"" + mesmoDoc.nome + "\".");
    let salvo;
    if (id) e.clientes = e.clientes.map((c) => (c.id === id ? (salvo = Object.assign({}, c, campos)) : c));
    else e.clientes = e.clientes.concat(salvo = Object.assign({ id: novoId("cli-"), contato: "", email: "", telefone: "" }, campos));
    if (!salvo) throw new Error("Empresa não encontrada.");
    gravar(CHAVE_DOCS, e);
    return salvo;
  }
  /** Quantos documentos (certidões + alvarás) cada empresa tem. */
  function qtdDocumentos() { const n = {}; docs().documentos.forEach((d) => { n[d.clienteId] = (n[d.clienteId] || 0) + 1; }); return n; }
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


  // ------------------------------------------------------------ importar, demonstração e limpar
  /** Grava o que lerPlanilhaCadastro achou. Empresas novas são criadas; documentos iguais (empresa+tipo+vencimento) não repetem. */
  function aplicarPlanilha(plano) {
    const e = docs();
    let novasEmp = 0, novosDocs = 0, repetidos = 0;
    const porNome = {};
    e.clientes.forEach((c) => { porNome[chaveNome(c.nome)] = c; });
    plano.empresas.forEach((p) => {
      const k = chaveNome(p.nome);
      if (porNome[k]) { ["documento", "regime", "codigo"].forEach((x) => { if (!porNome[k][x] && p[x]) porNome[k][x] = p[x]; }); return; }
      const c = { id: novoId("cli-"), nome: p.nome, documento: p.documento || "", codigo: p.codigo || "", regime: p.regime || "", contato: "", email: "", telefone: "" };
      e.clientes.push(c); porNome[k] = c; novasEmp++;
    });
    plano.documentos.forEach((d) => {
      const c = porNome[chaveNome(d.empresa)];
      if (e.documentos.some((x) => x.clienteId === c.id && chaveNome(x.tipo) === chaveNome(d.tipo) && x.vencimento === d.vencimento)) { repetidos++; return; }
      e.documentos.push({ id: novoId("doc-"), clienteId: c.id, tipo: d.tipo, numero: d.numero, emissao: d.emissao, vencimento: d.vencimento,
        responsavel: d.responsavel, observacoes: "", link: "", andamento: "pendente", criadoEm: hoje(), historico: [] });
      novosDocs++;
    });
    gravar(CHAVE_DOCS, e);
    if (plano.faturamentos.length) {
      const d = dados();
      plano.faturamentos.forEach((f) => {
        const c = porNome[chaveNome(f.empresa)];
        const a = d.faturamentos[f.ano] = d.faturamentos[f.ano] || {};
        (a[c.id] = a[c.id] || {})[f.mes] = Math.round(f.valor * 100) / 100;
      });
      gravar(CHAVE, d);
    }
    return { novasEmp, novosDocs, repetidos, faturamentos: plano.faturamentos.length };
  }

  /** Documento novo a partir de um PDF lido (lerCertidao). Cria a empresa se o CNPJ não estiver cadastrado e vier o nome. */
  function empresaPorDocumento(documento) {
    const dig = String(documento || "").replace(/\D/g, "");
    if (dig.length < 11) return null;
    return docs().clientes.find((c) => String(c.documento || "").replace(/\D/g, "") === dig) || null;
  }

  /** Dados fictícios (ids "ex-") só onde está vazio: empresas, certidões, alvarás, faturamento e demonstrativos. */
  function carregarDemonstracao(exemploDocs) {
    const e = docs();
    let fez = false;
    if (!e.clientes.length && !e.documentos.length) {
      // a demonstração ganha CNPJ, regime e código fictícios, e uma filial da primeira empresa
      const ex = Object.assign({}, exemploDocs, { clientes: (exemploDocs.clientes || []).map((c, i) => Object.assign({}, c, {
        documento: c.documento || (String(i + 1).repeat(2) + "." + String(i + 1).repeat(3) + "." + String(i + 1).repeat(3) + "/0001-" + String(i + 1).repeat(2)),
        regime: c.regime || REGIMES[i % 3], codigo: c.codigo || String(101 + i) })) });
      if (ex.clientes.length) {
        const m = ex.clientes[0];
        ex.clientes = ex.clientes.concat({ id: "ex-filial", nome: m.nome + " (filial)", documento: m.documento.replace("/0001-", "/0002-"), regime: m.regime, codigo: "", contato: "", email: "", telefone: "" });
      }
      gravar(CHAVE_DOCS, Object.assign(e, ex)); fez = true;
    }
    const ids = docs().clientes.map((c) => c.id);
    const d = dados();
    const ano = String(agora().getFullYear()), mesAtual = agora().getMonth() + 1;
    if (!Object.keys(d.faturamentos).length && ids.length) {
      d.faturamentos[ano] = {};
      ids.forEach((id, k) => {
        const base = 18000 + k * 13500;
        d.faturamentos[ano][id] = {};
        for (let m = 1; m < mesAtual; m++) d.faturamentos[ano][id][String(m).padStart(2, "0")] = Math.round(base * (0.85 + ((m * 7 + k * 3) % 10) / 20) * 100) / 100;
      });
      fez = true;
    }
    if (!Object.keys(d.demonstrativos).length && ids.length) {
      const ant = String(agora().getFullYear() - 1);
      d.demonstrativos[ant] = {};
      const sts = ["entregue", "emitido", "", "entregue"];
      ids.forEach((id, k) => {
        d.demonstrativos[ant][id] = {};
        DEMONSTRATIVOS.forEach((t, j) => { const st = j === 2 && k % 2 ? "nao_se_aplica" : sts[(k + j) % 4]; if (st) d.demonstrativos[ant][id][t] = { status: st, em: hoje() }; });
      });
      fez = true;
    }
    if (fez) gravar(CHAVE, d);
    return fez;
  }
  function temDemonstracao() { return docs().clientes.some((c) => /^ex-/.test(c.id)); }
  /** soDemo: tira só o que é fictício (ids "ex-"). Devolve uma função que desfaz. */
  function limpar(soDemo) {
    const antes = { docs: ls.getItem(CHAVE_DOCS), dados: ls.getItem(CHAVE) };
    if (soDemo) {
      const e = docs();
      // empresa fictícia que já recebeu documento de verdade fica (só os documentos fictícios saem)
      e.documentos = e.documentos.filter((x) => !/^ex-/.test(x.id));
      const usadas = new Set(e.documentos.map((x) => x.clienteId));
      const fora = new Set(e.clientes.filter((c) => /^ex-/.test(c.id) && !usadas.has(c.id)).map((c) => c.id));
      e.clientes = e.clientes.filter((c) => !fora.has(c.id));
      gravar(CHAVE_DOCS, e);
      const d = dados();
      // faturamento e demonstrativos de empresas fictícias são fictícios: saem todos
      const ficticias = new Set(((JSON.parse(antes.docs || "{}") || {}).clientes || []).filter((c) => /^ex-/.test(c.id)).map((c) => c.id));
      ["faturamentos", "demonstrativos"].forEach((k) => Object.keys(d[k]).forEach((ano) => ficticias.forEach((id) => { delete d[k][ano][id]; })));
      gravar(CHAVE, d);
    } else {
      gravar(CHAVE_DOCS, { clientes: [], documentos: [] });
      gravar(CHAVE, { faturamentos: {}, demonstrativos: {} });
    }
    return () => {
      if (antes.docs === null) gravar(CHAVE_DOCS, { clientes: [], documentos: [] }); else { ls.setItem(CHAVE_DOCS, antes.docs); avisar(); }
      if (antes.dados !== null) { ls.setItem(CHAVE, antes.dados); avisar(); }
    };
  }
  /** Anexo (PDF) guardado à parte: o documento só leva o nome e o tamanho. */
  function marcarAnexo(id, anexo) {
    const e = docs();
    const d = e.documentos.find((x) => x.id === id);
    if (!d) return;
    if (anexo) d.anexo = { nome: txt(anexo.nome), tamanho: anexo.tamanho || 0 }; else delete d.anexo;
    gravar(CHAVE_DOCS, e);
  }

  return {
    aplicarPlanilha, empresaPorDocumento, carregarDemonstracao, temDemonstracao, limpar, marcarAnexo,
    hoje, empresas, salvarEmpresa, excluirEmpresa, qtdDocumentos, documentos, resumo, urgentes, salvarDocumento, renovar, excluirDocumento,
    faturamentos, definirFaturamento, totalAno, ultimos12, demonstrativos, definirDemonstrativo, progressoDemonstrativos
  };
}
