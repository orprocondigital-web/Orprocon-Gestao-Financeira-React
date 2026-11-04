/*
 * Carteira do usuário: quais empresas cada pessoa vê nas telas (Departamento Cadastro, Controle de horas, ISS).
 *   setores  = departamentos do Acessórias ("Departamento Pessoal"...): vê as empresas que têm um deles;
 *   carteira = CNPJs/CPFs das empresas que a pessoa cuida (importados da lista do Acessórias).
 * Os dois juntos: vê as empresas do setor que estão na carteira. Nenhum: vê todas. O admin vê todas.
 * O filtro é só de tela (os dados de cada módulo continuam num bloco único no servidor).
 * Sem tela: testado em tests/carteira.test.js.
 */

const txt = (v) => String(v == null ? "" : v).trim();
const digitos = (v) => txt(v).replace(/\D/g, "");
const semAcento = (s) => txt(s).normalize("NFD").replace(/[̀-ͯ]/g, "");

/** "Departamento Pessoal", "Depto. Pessoal" e "pessoal" são o mesmo setor. */
export function chaveSetor(s) {
  return semAcento(s).toLowerCase().replace(/^(departamento|depto\.?|dpto\.?|setor)\s+(de\s+|do\s+|da\s+)?/, "").replace(/\s+/g, " ").trim();
}

/** Setores que aparecem nas empresas (departamentos do Acessórias), sem repetir, em ordem alfabética. */
export function setoresDasEmpresas(empresas) {
  const vistos = {};
  (empresas || []).forEach((c) => (Array.isArray(c.departamentos) ? c.departamentos : []).forEach((d) => {
    const k = chaveSetor(d);
    if (k && !vistos[k]) vistos[k] = txt(d);
  }));
  return Object.values(vistos).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Quantas empresas cada setor tem. */
export function contarPorSetor(empresas) {
  const n = {};
  (empresas || []).forEach((c) => {
    const ks = new Set((Array.isArray(c.departamentos) ? c.departamentos : []).map(chaveSetor));
    ks.forEach((k) => { if (k) n[k] = (n[k] || 0) + 1; });
  });
  return n;
}

/** O usuário tem alguma limitação? (admin e quem não tem setor nem carteira veem tudo) */
export function temCarteira(usuario) {
  return !!usuario && usuario.perfil !== "admin" && ((usuario.setores || []).length > 0 || (usuario.carteira || []).length > 0);
}

/**
 * Filtro das telas: fn(empresa) → true se a pessoa vê a empresa, ou null (vê todas).
 * empresa: { documento | cnpj, departamentos? }. departamentosDe(doc): para empresas de outros módulos (Controle de
 * horas, ISS), que não guardam os departamentos: busca no cadastro do Departamento Cadastro pelo CNPJ.
 */
export function criarFiltro(usuario, departamentosDe = () => []) {
  if (!temCarteira(usuario)) return null;
  const setores = (usuario.setores || []).map(chaveSetor).filter(Boolean);
  const carteira = new Set((usuario.carteira || []).map(digitos).filter(Boolean));
  return (emp) => {
    if (!emp) return false;
    const d = digitos(emp.documento != null && emp.documento !== "" ? emp.documento : emp.cnpj);
    if (carteira.size && !carteira.has(d)) return false;
    if (!setores.length) return true;
    const deps = Array.isArray(emp.departamentos) ? emp.departamentos : (d ? departamentosDe(d) || [] : []);
    return deps.some((x) => setores.includes(chaveSetor(x)));
  };
}

// ------------------------------------------------------------ importar a lista do Acessórias

const PARADAS = new Set(["de", "da", "do", "das", "dos", "e"]);
function tokens(nome) {
  return semAcento(nome).toLowerCase().replace(/[^a-z\s.]/g, " ").split(/\s+/)
    .filter((t) => t && !PARADAS.has(t) && !/^[a-z]\.?$/.test(t) && !/\.$/.test(t));
}

/**
 * Acha o usuário pelo que vem na planilha: e-mail, nome completo ou nome abreviado do Acessórias
 * ("Mario H. C. Bona" = "Mario Henrique Ceolin de Bona": mesmo primeiro e último nome). Ambíguo ou não achado: null.
 */
export function acharUsuario(texto, usuarios) {
  const t = txt(texto);
  if (!t) return null;
  const email = t.toLowerCase();
  const porEmail = usuarios.find((u) => txt(u.email).toLowerCase() === email);
  if (porEmail) return porEmail;
  const tk = tokens(t);
  if (!tk.length) return null;
  const exato = usuarios.filter((u) => tokens(u.nome).join(" ") === tk.join(" "));
  if (exato.length === 1) return exato[0];
  const primeiro = tk[0], ultimo = tk[tk.length - 1];
  const parecidos = usuarios.filter((u) => {
    const ut = tokens(u.nome);
    if (!ut.length || ut[0] !== primeiro) return false;
    if (tk.length === 1) return ut.length === 1;
    return ut[ut.length - 1] === ultimo;
  });
  return parecidos.length === 1 ? parecidos[0] : null;
}

/** "Departamento Contábil - Mario H. C. Bona" → { setor, nome }. Texto sem setor: { setor: "", nome }. */
export function separarResponsavel(texto) {
  const t = txt(texto);
  const m = /^((?:departamento|depto\.?|dpto\.?)\s[^-]+?)\s+-\s+(.+)$/i.exec(t);
  return m ? { setor: m[1].trim(), nome: m[2].trim() } : { setor: "", nome: t };
}

/** "BITE AUTO PECAS LTDA (Matriz Tubarão) [759|0001-20]" → { nome, codigo: "759", finalCnpj: "000120" }. */
export function separarEmpresa(texto) {
  const t = txt(texto);
  const m = /^(.*?)\s*\[\s*(\d+)\s*\|\s*([\d.\-\/\s]+)\]\s*$/.exec(t);
  if (!m) return { nome: t.replace(/\s*\((matriz|filial)[^)]*\)\s*$/i, ""), codigo: "", finalCnpj: "" };
  return { nome: m[1].replace(/\s*\((matriz|filial)[^)]*\)\s*$/i, "").trim(), codigo: m[2].replace(/^0+(?=\d)/, ""), finalCnpj: digitos(m[3]) };
}

const chaveNome = (s) => semAcento(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
const CAB = {
  responsavel: ["responsavel", "resp", "usuario", "colaborador", "funcionario", "dpto - resp", "depto - resp", "departamento - responsavel", "e-mail do responsavel", "email"],
  documento: ["cnpj", "cpf", "cnpj/cpf", "cpf/cnpj", "documento", "cnpj / cpf", "inscricao"],
  empresa: ["empresa", "cliente", "razao social", "razao", "nome da empresa", "nome"],
  codigo: ["id", "codigo", "cod", "id empresa", "codigo da empresa"]
};
const norm = (v) => semAcento(v).toLowerCase().replace(/[.:]/g, "").replace(/\s+/g, " ").trim();
const ACESSORIAS_EMPRESA = /\[\s*\d+\s*\|\s*[\d.\-\/\s]+\]\s*$/;
const ACESSORIAS_RESP = /^(departamento|depto\.?|dpto\.?)\s[^-]+?\s+-\s+\S/i;

/**
 * Lê a planilha (abas como em leitores.lerPlanilha: [{ nome, rows }]) e separa as empresas de cada usuário.
 * Aceita colunas Responsável/Usuário + CNPJ (ou Empresa), e também a exportação do Acessórias com
 * "Empresa [ID|final do CNPJ]" e "Departamento X - Nome". empresas: as do Departamento Cadastro (com documento e codigo).
 * Devolve { porUsuario: [{ usuario, cnpjs: [...] }], semUsuario: [{ nome, empresas }], semEmpresa: [texto], linhas }.
 */
/**
 * Acha o CNPJ/CPF de uma empresa do cadastro pelo que vem na planilha: o documento inteiro, ou o nome do Acessórias
 * com [ID|final do CNPJ] (ou uma coluna de código). Devolve só os dígitos, ou "" se não achou com certeza.
 */
export function criarAchadorDeEmpresa(empresas) {
  const porCodigo = {}, porNome = {};
  (empresas || []).forEach((c) => {
    const cod = txt(c.codigo).replace(/^0+(?=\d)/, "");
    if (cod) (porCodigo[cod] = porCodigo[cod] || []).push(c);
    const n = chaveNome(c.nome);
    if (n) (porNome[n] = porNome[n] || []).push(c);
  });
  return (doc, texto, codigoCol) => {
    const d = digitos(doc);
    if (d.length === 11 || d.length === 14) return d;   // CNPJ/CPF inteiro: vale mesmo que a empresa ainda não esteja no cadastro
    const e = separarEmpresa(texto);
    const cod = e.codigo || txt(codigoCol).replace(/^0+(?=\d)/, "");
    const fim = e.finalCnpj;
    const confere = (c) => !fim || digitos(c.documento).endsWith(fim);
    let cands = cod ? (porCodigo[cod] || []).filter(confere) : [];
    if (cands.length !== 1) cands = (porNome[chaveNome(e.nome)] || []).filter(confere);
    return cands.length === 1 && digitos(cands[0].documento).length >= 11 ? digitos(cands[0].documento) : "";
  };
}

/** Linhas de cada aba: [{ resp, doc, emp, cod }] pelo cabeçalho; sem cabeçalho conhecido, acha pelas células (Acessórias). */
function linhasDasAbas(abas, exigeResponsavel) {
  const out = [];
  (abas || []).forEach((aba) => {
    const rows = (aba.rows || []).map((r) => (r || []).map((c) => (c instanceof Date ? "" : txt(c))));
    let col = null, ini = 0;
    for (let i = 0; i < Math.min(rows.length, 15) && !col; i++) {
      const m = {};
      rows[i].forEach((c, j) => { const n = norm(c); Object.keys(CAB).forEach((k) => { if (m[k] === undefined && CAB[k].includes(n)) m[k] = j; }); });
      if ((m.responsavel !== undefined || !exigeResponsavel) && (m.documento !== undefined || m.empresa !== undefined)) { col = m; ini = i + 1; }
    }
    rows.slice(ini).forEach((r) => {
      if (col) {
        out.push({ resp: col.responsavel !== undefined ? r[col.responsavel] : "", doc: col.documento !== undefined ? r[col.documento] : "",
          emp: col.empresa !== undefined ? r[col.empresa] : "", cod: col.codigo !== undefined ? r[col.codigo] : "" });
      } else {
        const emp = r.find((c) => ACESSORIAS_EMPRESA.test(c)) || "";
        const doc = exigeResponsavel ? "" : (r.find((c) => { const d = digitos(c); return (d.length === 14 || d.length === 11) && /[./-]/.test(c); }) || "");
        out.push({ resp: r.find((c) => ACESSORIAS_RESP.test(c)) || "", doc, emp, cod: "" });
      }
    });
  });
  return out.filter((l) => txt(l.doc) || txt(l.emp));
}

/**
 * Planilha de UM usuário (escolhida dentro do cadastro dele): só as empresas, sem precisar da coluna de responsável.
 * Devolve { cnpjs: [...], semEmpresa: [texto], linhas }.
 */
export function empresasDaPlanilha(abas, empresas) {
  const achar = criarAchadorDeEmpresa(empresas);
  const cnpjs = new Set(), semEmpresa = [];
  const linhas = linhasDasAbas(abas, false);
  linhas.forEach((l) => {
    const d = achar(l.doc, l.emp, l.cod);
    if (d) cnpjs.add(d);
    else if (!semEmpresa.includes(txt(l.emp) || txt(l.doc))) semEmpresa.push(txt(l.emp) || txt(l.doc));
  });
  return { cnpjs: Array.from(cnpjs).sort(), semEmpresa, linhas: linhas.length };
}

export function lerPlanilhaCarteira(abas, usuarios, empresas) {
  const acharEmpresa = criarAchadorDeEmpresa(empresas);
  const mapa = new Map(), semUsuario = {}, semEmpresa = [];
  let linhas = 0;
  linhasDasAbas(abas, true).forEach(({ resp, doc, emp, cod }) => {
    if (!txt(resp)) return;
    linhas++;
    const { nome } = separarResponsavel(resp);
    const u = acharUsuario(nome, usuarios);
    const d = acharEmpresa(doc, emp, cod);
    if (!u) { const s = semUsuario[nome] = semUsuario[nome] || new Set(); if (d) s.add(d); return; }
    if (!d) { if (!semEmpresa.includes(txt(emp) || txt(doc))) semEmpresa.push(txt(emp) || txt(doc)); return; }
    if (!mapa.has(u.id)) mapa.set(u.id, { usuario: u, cnpjs: new Set() });
    mapa.get(u.id).cnpjs.add(d);
  });
  return {
    porUsuario: Array.from(mapa.values()).map((x) => ({ usuario: x.usuario, cnpjs: Array.from(x.cnpjs).sort() }))
      .sort((a, b) => txt(a.usuario.nome).localeCompare(txt(b.usuario.nome), "pt-BR")),
    semUsuario: Object.keys(semUsuario).map((nome) => ({ nome, empresas: semUsuario[nome].size })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    semEmpresa,
    linhas
  };
}
