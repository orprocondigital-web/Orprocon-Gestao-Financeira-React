/*
 * Em Dia (simples): o que cada um faz no mês, numa grade como a planilha de controle de entregas.
 * Empresas nas linhas, obrigações de cada setor nas colunas, situação em cada célula, por competência.
 * Mais a passagem de bastão (quando alguém falta) e um diário curto.
 *
 * As empresas são as mesmas do Departamento Cadastro (chave "painelVencimentos:v1"), para ninguém cadastrar
 * duas vezes. O resto fica em "emDia:v2" (a versão antiga, "emDia:v1", não é apagada).
 * Sem tela; testado em tests/emDia.test.js.
 */

import { ativaNoMes, ehFilial, raizCnpj, regimePeloTexto } from "./depCadastro.mjs";

export const CHAVE = "emDia:v2";
const MESES_NUM = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** Atalhos para os meses em que a obrigação vale. */
export const ATALHOS_MESES = [{ id: "mensal", nome: "Todo mês", meses: [] }, { id: "trimestral", nome: "Fim de trimestre", meses: ["03", "06", "09", "12"] }];
/** Quando vence, contando da competência: no mesmo mês, no seguinte ou dois meses depois. */
export const VENCE_DEPOIS = [{ id: 0, nome: "do mesmo mês" }, { id: 1, nome: "do mês seguinte" }, { id: 2, nome: "do 2º mês seguinte" }];

/**
 * Regra de uma obrigação, no formato atual (como o ObrigConfig do sistema antigo):
 * meses [] = todo mês · regimes [] = todos · lucroReal "" | Trimestral | Anual · inicio AAAA-MM ·
 * venc { dia: 1..31 | "util" (último dia útil), depois: 0..2 } ou null · codigo · ativa.
 * Aceita o formato anterior (freq mensal/trimestral/anual + mesAnual).
 */
export function normalizarRegra(r) {
  const x = r || {};
  let meses = Array.isArray(x.meses) ? x.meses.filter((m) => MESES_NUM.includes(m)) : null;
  if (!meses) meses = x.freq === "trimestral" ? ["03", "06", "09", "12"] : x.freq === "anual" ? [x.mesAnual || "12"] : [];
  if (meses.length === 12) meses = [];
  const v = x.venc && (x.venc.dia === "util" || (Number(x.venc.dia) >= 1 && Number(x.venc.dia) <= 31))
    ? { dia: x.venc.dia === "util" ? "util" : Number(x.venc.dia), depois: [0, 1, 2].includes(Number(x.venc.depois)) ? Number(x.venc.depois) : 1 } : null;
  return { meses: meses.slice().sort(), regimes: Array.isArray(x.regimes) ? x.regimes.filter(Boolean) : [], lucroReal: x.lucroReal || "",
    inicio: x.inicio || "", venc: v, codigo: txt(x.codigo), ativa: x.ativa !== false };
}
const regraVazia = (r) => !r.meses.length && !r.regimes.length && !r.lucroReal && !r.inicio && !r.venc && !r.codigo && r.ativa;

/** Data de vencimento (AAAA-MM-DD) da obrigação na competência; "" sem vencimento definido. */
export function vencimento(regra, mes) {
  const r = normalizarRegra(regra);
  if (!r.venc) return "";
  const [a, m] = mes.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + r.venc.depois, 1));
  const ano = alvo.getUTCFullYear(), mm = alvo.getUTCMonth();
  const ultimo = new Date(Date.UTC(ano, mm + 1, 0)).getUTCDate();
  let dia;
  if (r.venc.dia === "util") {   // último dia útil (sem feriados): sábado e domingo voltam para sexta
    const d = new Date(Date.UTC(ano, mm, ultimo)).getUTCDay();
    dia = ultimo - (d === 0 ? 2 : d === 6 ? 1 : 0);
  } else dia = Math.min(r.venc.dia, ultimo);
  return ano + "-" + String(mm + 1).padStart(2, "0") + "-" + String(dia).padStart(2, "0");
}
export const STATUS = [
  { id: "", nome: "Pendente" }, { id: "feito", nome: "Feito" }, { id: "na", nome: "Não se aplica" }
];
export const SETORES_PADRAO = [
  { id: "contabil", nome: "Contábil", obrigacoes: ["Conciliação", "Lançamentos", "Balancete"] },
  { id: "fiscal", nome: "Fiscal", obrigacoes: ["Apuração", "SPED / EFD", "Guias enviadas"] },
  { id: "dp", nome: "Departamento Pessoal", obrigacoes: ["Folha", "FGTS", "DCTFWeb"] }
];

const txt = (v) => (v === null || v === undefined ? "" : String(v).trim());
export function chaveNome(s) { return txt(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " "); }
const digitos = (s) => txt(s).replace(/\D/g, "");

/** "Mauricio" bate com "Mauricio Goulart" e com o e-mail (o responsável é digitado de vários jeitos). */
export function ehMesmaPessoa(texto, pessoa) {
  const t = chaveNome(texto);
  if (!t || !pessoa) return false;
  const nome = chaveNome(pessoa.nome), primeiro = nome.split(" ")[0];
  return t === nome || t === primeiro || t === chaveNome(pessoa.email) || t.split(" ")[0] === primeiro && nome.indexOf(t) === 0;
}

/** Setor pelo nome do departamento que vem de outro sistema ("Pessoal", "DP", "Fiscal"…). */
export function setorDoDepartamento(dep) {
  const d = chaveNome(dep);
  if (/pessoal|^dp$|folha|trabalhist/.test(d)) return "dp";
  if (/fiscal|tribut/.test(d)) return "fiscal";
  if (/contab/.test(d)) return "contabil";
  return "";
}
/**
 * A obrigação vale para a empresa na competência? regra: { regimes: [] (vazio = todos), inicio: "AAAA-MM",
 * freq: mensal | trimestral | anual, mesAnual: "01".."12" }.
 */
export function obrigacaoVale(regra, empresa, mes) {
  const r = normalizarRegra(regra);
  if (!r.ativa) return false;
  if (r.inicio && mes < r.inicio) return false;
  const regime = (empresa && empresa.regime) || "";
  if (r.regimes.length && !r.regimes.includes(regime)) return false;
  // como no sistema antigo: regra só do Lucro Real trimestral (ou anual) não vale para a empresa do outro tipo
  if (r.lucroReal && regime === "Lucro Real" && ((empresa && empresa.tipoLucroReal) || "") !== r.lucroReal) return false;
  if (r.meses.length && !r.meses.includes(mes.slice(5, 7))) return false;
  return true;
}
/** Texto curto da regra, para o cabeçalho da coluna. */
export function textoRegra(regra) {
  const r = normalizarRegra(regra), p = [];
  if (r.meses.length) p.push(r.meses.join(",") === "03,06,09,12" ? "trimestral" : r.meses.length === 1 ? "anual (" + MESES_CURTOS[Number(r.meses[0]) - 1] + ")" : r.meses.map((m) => MESES_CURTOS[Number(m) - 1]).join(", "));
  if (r.regimes.length) p.push(r.regimes.map((x) => (x === "Lucro Real" && r.lucroReal ? "Lucro Real " + r.lucroReal.toLowerCase() : x)).join(", "));
  else if (r.lucroReal) p.push("Lucro Real " + r.lucroReal.toLowerCase());
  if (r.venc) p.push("vence " + (r.venc.dia === "util" ? "no último dia útil" : "dia " + r.venc.dia) + " " + VENCE_DEPOIS.find((v) => v.id === r.venc.depois).nome);
  if (r.inicio) p.push("desde " + r.inicio.slice(5) + "/" + r.inicio.slice(0, 4));
  return p.join(" · ");
}

/** Situação de outro sistema → feito / não se aplica / pendente. */
export function statusDeTexto(s) {
  const t = chaveNome(s);
  if (/^ent|entreg|conclu|feito|^ok$|finaliz/.test(t)) return "feito";
  if (/dispens|nao se aplica|^n\/?a$/.test(t)) return "na";
  return "";
}

/** deps: { ls, agora?, aoMudar? } */
export function criarEmDia(deps) {
  const { ls } = deps;
  const agora = deps.agora || (() => new Date());
  const avisar = () => { if (deps.aoMudar) deps.aoMudar(); };
  let seq = 0;
  const novoId = (p) => p + agora().getTime().toString(36) + (seq++).toString(36);
  const hoje = () => { const d = agora(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  /** Competência de trabalho padrão: o mês anterior (em outubro se fecha setembro). */
  const mesPadrao = () => { const d = agora(); const m = new Date(d.getFullYear(), d.getMonth() - 1, 1); return m.getFullYear() + "-" + String(m.getMonth() + 1).padStart(2, "0"); };

  function ler(k, padrao) { try { const v = JSON.parse(ls.getItem(k) || "null"); return v && typeof v === "object" ? v : padrao; } catch (e) { return padrao; } }
  function dados() {
    const e = ler(CHAVE, {});
    return {
      setores: Array.isArray(e.setores) && e.setores.length ? e.setores : SETORES_PADRAO.map((s) => Object.assign({}, s, { obrigacoes: s.obrigacoes.slice() })),
      responsaveis: e.responsaveis || {}, histResp: e.histResp || {}, status: e.status || {}, obs: e.obs || {}, ocultas: e.ocultas || {}, regras: e.regras || {}, fechados: e.fechados || {},
      diario: Array.isArray(e.diario) ? e.diario : [], bastao: Array.isArray(e.bastao) ? e.bastao : []
    };
  }
  function gravar(d) { ls.setItem(CHAVE, JSON.stringify(d)); avisar(); }
  /** As situações de uma empresa num setor e mês (cria o caminho se não existir). */
  function celulasDe(d, mes, empresaId, setorId) {
    const m = d.status[mes] = d.status[mes] || {};
    const e = m[empresaId] = m[empresaId] || {};
    return e[setorId] = e[setorId] || {};
  }
  function cadastro() { const e = ler("painelVencimentos:v1", {}); return Object.assign({}, e, { clientes: Array.isArray(e.clientes) ? e.clientes : [], documentos: Array.isArray(e.documentos) ? e.documentos : [] }); }

  // ------------------------------------------------------------ setores e obrigações (colunas)
  /** Setores com as obrigações (colunas) e a regra de cada uma (regras[nome]). */
  function setores() { const d = dados(); return d.setores.map((s) => Object.assign({}, s, { regras: regrasDe(d, s) })); }
  function regrasDe(d, s) {
    const r = d.regras[s.id] || {}, out = {};
    s.obrigacoes.forEach((o) => { if (r[chaveNome(o)]) out[o] = normalizarRegra(r[chaveNome(o)]); });
    return out;
  }
  /**
   * lista: nomes, ou { nome, regimes, inicio, freq, mesAnual }. Regra vazia (todo mês, todos os regimes)
   * não é guardada. Renomear uma coluna começa ela sem situações e sem regra.
   */
  function salvarObrigacoes(setorId, lista) {
    const limpa = [];
    lista.map((o) => (typeof o === "string" ? { nome: o } : o || {})).forEach((o) => {
      const nome = txt(o.nome);
      if (nome && !limpa.some((x) => chaveNome(x.nome) === chaveNome(nome))) limpa.push(Object.assign({}, o, { nome }));
    });
    if (!limpa.length) throw new Error("Deixe pelo menos uma obrigação.");
    limpa.forEach((o) => {
      if (o.inicio && !/^\d{4}-\d{2}$/.test(o.inicio)) throw new Error(o.nome + ": início em mês e ano (AAAA-MM).");
      if (o.venc && o.venc.dia !== "util" && o.venc.dia !== "" && o.venc.dia !== undefined && !(Number(o.venc.dia) >= 1 && Number(o.venc.dia) <= 31)) throw new Error(o.nome + ": dia do vencimento de 1 a 31.");
    });
    const d = dados();
    const s = d.setores.find((x) => x.id === setorId);
    if (!s) throw new Error("Setor não encontrado.");
    s.obrigacoes = limpa.map((o) => o.nome);
    const antigas = d.regras[setorId] || {}, regras = {};
    limpa.forEach((o) => {
      const k = chaveNome(o.nome);
      const temRegra = ["regimes", "inicio", "freq", "meses", "venc", "lucroReal", "codigo", "ativa"].some((c) => c in o);
      const r = temRegra ? normalizarRegra(Object.assign({}, o, { venc: o.venc && o.venc.dia !== "" && o.venc.dia !== undefined ? o.venc : null })) : antigas[k] && normalizarRegra(antigas[k]);
      if (r && !regraVazia(r)) regras[k] = r;
    });
    d.regras[setorId] = regras;
    gravar(d);
  }
  function garantirSetor(d, id, nome) {
    let s = d.setores.find((x) => x.id === id || chaveNome(x.nome) === chaveNome(nome));
    if (!s) { s = { id: id || novoId("set-"), nome: nome || id, obrigacoes: [] }; d.setores.push(s); }
    return s;
  }

  // ------------------------------------------------------------ empresas (as do Departamento Cadastro)
  function empresas() {
    return cadastro().clientes.slice().sort((a, b) => txt(a.nome).localeCompare(txt(b.nome), "pt-BR"))
      .map((c) => (c.regime && !regimePeloTexto(c.regime) ? c : Object.assign({}, c, { regime: regimePeloTexto(c.regime) })));
  }
  function empresaPara(nome, cnpj, criar) {
    const e = cadastro();
    const dig = digitos(cnpj);
    let c = (dig.length >= 11 && e.clientes.find((x) => digitos(x.documento) === dig)) || e.clientes.find((x) => chaveNome(x.nome) === chaveNome(nome));
    if (!c && criar && txt(nome)) {
      c = { id: novoId("cli-"), nome: txt(nome), documento: txt(cnpj), regime: "", contato: "", email: "", telefone: "" };
      e.clientes.push(c);
      ls.setItem("painelVencimentos:v1", JSON.stringify(e));
    }
    return c || null;
  }
  /** Esconde uma empresa da grade de um setor (ex.: cliente sem DP). */
  function ocultar(setorId, empresaId, sim) {
    const d = dados();
    const l = new Set(d.ocultas[setorId] || []);
    if (sim) l.add(empresaId); else l.delete(empresaId);
    d.ocultas[setorId] = Array.from(l);
    gravar(d);
  }

  // ------------------------------------------------------------ responsável e situação
  /**
   * Responsável por competência (como o histórico do sistema antigo): cada troca grava { desde: AAAA-MM, nome }.
   * A primeira vez vale para sempre (desde ""). A grade de um mês usa quem era o responsável naquele mês,
   * então trocar a carteira de dono não muda os relatórios dos meses que já passaram.
   */
  function respNoMes(d, setorId, empresaId, mes) {
    const h = ((d.histResp[setorId] || {})[empresaId]) || [];
    if (!h.length) return ((d.responsaveis[setorId] || {})[empresaId]) || "";
    let nome = "";
    h.forEach((x) => { if (x.desde <= mes) nome = x.nome; });
    return nome;
  }
  function gravarResp(d, setorId, empresaId, nome, desde) {
    const hs = d.histResp[setorId] = d.histResp[setorId] || {};
    let h = hs[empresaId] || [];
    const atual = ((d.responsaveis[setorId] || {})[empresaId]) || "";
    if (!h.length && atual) h = [{ desde: "", nome: atual }];   // quem já estava (antes do histórico) vale para trás
    const de = h.length ? (desde || mesPadrao()) : "";
    h = h.filter((x) => x.desde !== de).concat({ desde: de, nome: txt(nome) }).sort((a, b) => a.desde.localeCompare(b.desde));
    // duas entradas seguidas com o mesmo nome viram uma
    h = h.filter((x, i) => i === 0 || x.nome !== h[i - 1].nome);
    hs[empresaId] = h;
    const r = d.responsaveis[setorId] = d.responsaveis[setorId] || {};
    const ultimo = h[h.length - 1].nome;
    if (ultimo) r[empresaId] = ultimo; else delete r[empresaId];
  }
  /** Todos os responsáveis de agora: { setorId: { empresaId: nome } }. */
  function todosResponsaveis() { return dados().responsaveis; }
  function responsavel(setorId, empresaId, mes) { const d = dados(); return mes ? respNoMes(d, setorId, empresaId, mes) : ((d.responsaveis[setorId] || {})[empresaId]) || ""; }
  /** Troca o responsável a partir da competência "desde" (padrão: o mês de trabalho). */
  function definirResponsavel(setorId, empresaId, nome, desde) {
    const d = dados();
    gravarResp(d, setorId, empresaId, nome, desde);
    gravar(d);
  }
  /** Quem foi responsável e desde quando, mais antigo primeiro. */
  function historicoResponsavel(setorId, empresaId) {
    const d = dados();
    const h = ((d.histResp[setorId] || {})[empresaId]) || [];
    if (h.length) return h.slice();
    const a = ((d.responsaveis[setorId] || {})[empresaId]) || "";
    return a ? [{ desde: "", nome: a }] : [];
  }
  /** Grava o histórico vindo de outro sistema (substitui o que houver). */
  function importarHistorico(setorId, empresaId, lista) {
    const d = dados();
    const h = lista.filter((x) => txt(x.nome)).map((x) => ({ desde: x.desde || "", nome: txt(x.nome) })).sort((a, b) => a.desde.localeCompare(b.desde));
    if (!h.length) return;
    (d.histResp[setorId] = d.histResp[setorId] || {})[empresaId] = h;
    (d.responsaveis[setorId] = d.responsaveis[setorId] || {})[empresaId] = h[h.length - 1].nome;
    gravar(d);
  }
  function definirStatus(mes, setorId, empresaId, obrigacao, status, quem) {
    if (!STATUS.some((s) => s.id === status)) throw new Error("Situação inválida.");
    const d = dados();
    const s = celulasDe(d, mes, empresaId, setorId);
    if (!status) delete s[obrigacao]; else s[obrigacao] = { s: status, por: txt(quem), em: hoje() };
    gravar(d);
  }
  function definirObs(mes, setorId, empresaId, texto) {
    const d = dados();
    const m = d.obs[mes] = d.obs[mes] || {};
    const e = m[empresaId] = m[empresaId] || {};
    if (txt(texto)) e[setorId] = txt(texto); else delete e[setorId];
    gravar(d);
  }

  /**
   * A grade de um setor no mês: uma linha por empresa (as ocultas ficam de fora), com a situação de
   * cada obrigação, o responsável e se está tudo feito. Mais os totais por pessoa e o geral.
   */
  function grade(mes, setorId, filtro) {
    const d = dados();
    const setor0 = d.setores.find((s) => s.id === setorId) || d.setores[0];
    const regras0 = regrasDe(d, setor0);
    // obrigação desativada sai da grade (continua na lista de obrigações para voltar depois)
    const setor = Object.assign({}, setor0, { regras: regras0, obrigacoes: setor0.obrigacoes.filter((o) => !regras0[o] || regras0[o].ativa) });
    const vencs = {};
    setor.obrigacoes.forEach((o) => { vencs[o] = vencimento(setor.regras[o], mes); });
    const ocultas = new Set(d.ocultas[setor.id] || []);
    const st = d.status[mes] || {};
    const hojeIso = hoje();
    const obs = d.obs[mes] || {};
    const f = filtro || {};
    // empresas que não eram clientes no mês, ou sem nenhuma obrigação que valha nele, ficam de fora
    let semObrigacao = 0;
    let linhas = empresas().filter((c) => !ocultas.has(c.id) && ativaNoMes(c, mes)).map((c) => {
      const s = (st[c.id] || {})[setor.id] || {};
      const celulas = setor.obrigacoes.map((o) => {
        const status = (s[o] || {}).s || "", vale = obrigacaoVale(setor.regras[o], c, mes);
        return { obrigacao: o, vale, status, por: (s[o] || {}).por || "", em: (s[o] || {}).em || "", vencimento: vencs[o], atrasada: vale && !status && !!vencs[o] && hojeIso > vencs[o] };
      });
      const valem = celulas.filter((x) => x.vale && x.status !== "na");
      const feitas = valem.filter((x) => x.status === "feito").length;
      return { empresa: c, responsavel: respNoMes(d, setor.id, c.id, mes), celulas, feitas, total: valem.length, atrasadas: celulas.filter((x) => x.atrasada).length,
        completo: valem.length > 0 && feitas === valem.length, obs: (obs[c.id] || {})[setor.id] || "" };
    }).filter((l) => { if (l.celulas.some((x) => x.vale)) return true; semObrigacao++; return false; });
    if (f.regime) linhas = linhas.filter((l) => (l.empresa.regime || "(sem)") === f.regime);
    if (f.matrizes) linhas = linhas.filter((l) => !ehFilial(l.empresa.documento));
    if (f.pessoa) linhas = linhas.filter((l) => (f.pessoa === "(sem)" ? !l.responsavel : chaveNome(l.responsavel) === chaveNome(f.pessoa) || ehMesmaPessoa(l.responsavel, f.pessoaObj)));
    if (f.pendentes) linhas = linhas.filter((l) => !l.completo);
    if (f.busca) { const b = chaveNome(f.busca); linhas = linhas.filter((l) => chaveNome(l.empresa.nome).indexOf(b) > -1 || digitos(l.empresa.documento).indexOf(digitos(f.busca) || "§") > -1); }
    const porPessoa = {};
    let feitas = 0, total = 0, atrasadas = 0;
    linhas.forEach((l) => {
      atrasadas += l.atrasadas;
      const k = l.responsavel || "(sem responsável)";
      const p = porPessoa[k] = porPessoa[k] || { pessoa: k, feitas: 0, total: 0, empresas: 0 };
      p.feitas += l.feitas; p.total += l.total; p.empresas++;
      feitas += l.feitas; total += l.total;
    });
    return {
      setor, linhas, feitas, total, atrasadas, vencimentos: vencs, pct: total ? Math.round(feitas / total * 100) : 0, semObrigacao,
      porPessoa: Object.values(porPessoa).sort((a, b) => a.pessoa.localeCompare(b.pessoa, "pt-BR")),
      ocultas: empresas().filter((c) => ocultas.has(c.id))
    };
  }
  /** Pessoas que aparecem como responsáveis (para as listas de escolha). */
  function pessoas() {
    const d = dados(), s = new Set();
    Object.values(d.responsaveis).forEach((r) => Object.values(r).forEach((n) => s.add(n)));
    Object.values(d.histResp).forEach((r) => Object.values(r).forEach((h) => h.forEach((x) => s.add(x.nome))));
    d.diario.forEach((x) => s.add(x.pessoa));
    return Array.from(s).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }
  /**
   * O ano de um setor: cada empresa com o andamento de JAN a DEZ (feitas, total e %; null quando não
   * havia nada a fazer no mês) e a equipe (cada responsável, mês a mês). filtro: o mesmo da grade.
   * O total do ano vai até o mês de trabalho (ate): os meses que ainda não chegaram não puxam o % para baixo.
   */
  function anual(ano, setorId, filtro) {
    const meses = Array.from({ length: 12 }, (_, i) => ano + "-" + String(i + 1).padStart(2, "0"));
    const grades = meses.map((m) => grade(m, setorId, filtro));
    const pct = (f, t) => (t ? Math.round(f / t * 100) : null);
    const porEmpresa = {}, porPessoa = {};
    const vazio = () => meses.map(() => ({ feitas: 0, total: 0 }));
    grades.forEach((g, i) => {
      g.linhas.forEach((l) => {
        const e = porEmpresa[l.empresa.id] = porEmpresa[l.empresa.id] || { empresa: l.empresa, responsavel: l.responsavel, meses: vazio() };
        e.meses[i].feitas += l.feitas; e.meses[i].total += l.total;
      });
      g.porPessoa.forEach((p) => {
        const e = porPessoa[p.pessoa] = porPessoa[p.pessoa] || { pessoa: p.pessoa, meses: vazio() };
        e.meses[i].feitas += p.feitas; e.meses[i].total += p.total;
      });
    });
    const ate = mesPadrao();
    const conta = (lista) => lista.filter((_, i) => meses[i] <= ate);
    const fechar = (x) => {
      const f = conta(x.meses).reduce((a, m) => a + m.feitas, 0), t = conta(x.meses).reduce((a, m) => a + m.total, 0);
      return Object.assign(x, { meses: x.meses.map((m) => Object.assign(m, { pct: pct(m.feitas, m.total) })), feitas: f, total: t, pct: pct(f, t) });
    };
    const linhas = Object.values(porEmpresa).map(fechar).sort((a, b) => txt(a.empresa.nome).localeCompare(txt(b.empresa.nome), "pt-BR"));
    const equipe = Object.values(porPessoa).map(fechar).sort((a, b) => a.pessoa.localeCompare(b.pessoa, "pt-BR"));
    const totais = grades.map((g) => ({ feitas: g.feitas, total: g.total, pct: pct(g.feitas, g.total) }));
    const f = conta(totais).reduce((a, m) => a + m.feitas, 0), t = conta(totais).reduce((a, m) => a + m.total, 0);
    return { ano, ate, meses, setor: grades[0].setor, linhas, equipe, totais, feitas: f, total: t, pct: pct(f, t) };
  }
  // ------------------------------------------------------------ fechamento contábil (o "mês fechado")
  /**
   * Um visto por empresa e mês, como o "Contabilidade › Minhas empresas" do sistema do Depto. Contábil.
   * A filial segue a matriz (não se marca à parte) e não entra nos totais; o mês em que a empresa não era
   * cliente fica "fora". O responsável é o do setor Contábil naquele mês.
   */
  function marcarFechado(empresaId, mes, sim, quem) {
    if (!/^\d{4}-\d{2}$/.test(mes || "")) throw new Error("Mês inválido.");
    const d = dados();
    const e = d.fechados[empresaId] = d.fechados[empresaId] || {};
    if (sim) e[mes] = { por: txt(quem), em: hoje() }; else delete e[mes];
    if (!Object.keys(e).length) delete d.fechados[empresaId];
    gravar(d);
  }
  function fechamento(ano, filtro) {
    const d = dados(), f = filtro || {};
    const meses = Array.from({ length: 12 }, (_, i) => ano + "-" + String(i + 1).padStart(2, "0"));
    const ate = mesPadrao();
    const lista = empresas();
    const matrizes = {};
    lista.forEach((c) => { const r = raizCnpj(c.documento); if (r && !ehFilial(c.documento)) matrizes[r] = c; });
    const pct = (a, b) => (b ? Math.round(a / b * 100) : null);
    const linhaDe = (c, base) => {
      const fx = d.fechados[base.id] || {};
      const cel = meses.map((m) => {
        if (!ativaNoMes(c, m)) return { mes: m, estado: "fora" };
        const x = fx[m];
        return x ? { mes: m, estado: "fechado", por: x.por, em: x.em } : { mes: m, estado: "aberto" };
      });
      const conta = cel.filter((x) => x.mes <= ate && x.estado !== "fora");
      const feitos = conta.filter((x) => x.estado === "fechado").length;
      return { empresa: c, responsavel: respNoMes(d, "contabil", c.id, ate), meses: cel, feitos, total: conta.length, pct: pct(feitos, conta.length) };
    };
    let linhas = [];
    lista.filter((c) => !ehFilial(c.documento) || !matrizes[raizCnpj(c.documento)]).forEach((c) => {
      // a empresa só aparece no ano em que foi cliente em algum mês
      if (!meses.some((m) => ativaNoMes(c, m))) return;
      linhas.push(Object.assign(linhaDe(c, c), { filial: false }));
      lista.filter((x) => ehFilial(x.documento) && raizCnpj(x.documento) === raizCnpj(c.documento) && raizCnpj(c.documento) && x.id !== c.id)
        .forEach((fl) => { if (meses.some((m) => ativaNoMes(fl, m))) linhas.push(Object.assign(linhaDe(fl, c), { filial: true, matrizId: c.id })); });
    });
    const b = chaveNome(f.busca);
    if (f.regime) linhas = linhas.filter((l) => (l.empresa.regime || "(sem)") === f.regime);
    if (f.matrizes) linhas = linhas.filter((l) => !l.filial);
    if (f.pessoa) linhas = linhas.filter((l) => (f.pessoa === "(sem)" ? !l.responsavel : chaveNome(l.responsavel) === chaveNome(f.pessoa)));
    if (b) linhas = linhas.filter((l) => chaveNome(l.empresa.nome).indexOf(b) > -1 || digitos(l.empresa.documento).indexOf(digitos(f.busca) || "§") > -1);
    // totais e equipe: só as matrizes (a filial segue a matriz), por responsável do mês
    const totais = meses.map(() => ({ feitos: 0, total: 0 }));
    const eq = {};
    linhas.filter((l) => !l.filial).forEach((l) => {
      l.meses.forEach((x, i) => {
        if (x.estado === "fora") return;
        totais[i].total++; if (x.estado === "fechado") totais[i].feitos++;
        const p = respNoMes(d, "contabil", l.empresa.id, x.mes) || "(sem responsável)";
        const e = eq[p] = eq[p] || { pessoa: p, meses: meses.map(() => ({ feitos: 0, total: 0 })) };
        e.meses[i].total++; if (x.estado === "fechado") e.meses[i].feitos++;
      });
    });
    const somaAte = (arr) => arr.reduce((a, x, i) => (meses[i] <= ate ? { f: a.f + x.feitos, t: a.t + x.total } : a), { f: 0, t: 0 });
    const equipe = Object.values(eq).map((e) => { const s = somaAte(e.meses); return Object.assign(e, { meses: e.meses.map((m) => Object.assign(m, { pct: pct(m.feitos, m.total) })), feitos: s.f, total: s.t, pct: pct(s.f, s.t) }); })
      .sort((a, c) => a.pessoa.localeCompare(c.pessoa, "pt-BR"));
    const s = somaAte(totais);
    return { ano: String(ano), ate, meses, linhas, totais: totais.map((t) => Object.assign(t, { pct: pct(t.feitos, t.total) })), equipe, feitos: s.f, total: s.t, pct: pct(s.f, s.t) };
  }
  /** Para o Início: empresas (matrizes) com o mês fechado, no geral e as minhas. */
  function resumoFechamento(mes, pessoa) {
    const fz = fechamento(mes.slice(0, 4));
    const i = Number(mes.slice(5)) - 1;
    let minhas = 0, minhasFeitas = 0;
    fz.linhas.filter((l) => !l.filial && l.meses[i].estado !== "fora").forEach((l) => {
      if (pessoa && ehMesmaPessoa(l.responsavel, pessoa)) { minhas++; if (l.meses[i].estado === "fechado") minhasFeitas++; }
    });
    return { mes, feitos: fz.totais[i].feitos, total: fz.totais[i].total, minhas, minhasFeitas };
  }

  /** Resumo para o Início: o geral do mês (todos os setores) e as pendências de uma pessoa. */
  function resumo(mes, pessoa) {
    let feitas = 0, total = 0, minhas = 0;
    dados().setores.forEach((s) => {
      grade(mes, s.id).linhas.forEach((l) => {
        feitas += l.feitas; total += l.total;
        if (pessoa && ehMesmaPessoa(l.responsavel, pessoa)) minhas += l.total - l.feitas;
      });
    });
    return { mes, feitas, total, pct: total ? Math.round(feitas / total * 100) : 0, minhas };
  }

  // ------------------------------------------------------------ passagem de bastão
  /** Quem saiu passa as empresas com pendência (no setor e mês) para quem assume. Devolve quantas e um desfazer. */
  function passarBastao(mes, setorId, de, para, motivo) {
    if (!txt(de) || !txt(para)) throw new Error("Escolha quem sai e quem assume.");
    if (chaveNome(de) === chaveNome(para)) throw new Error("Escolha pessoas diferentes.");
    const antes = ls.getItem(CHAVE);
    const g = grade(mes, setorId);
    const ids = g.linhas.filter((l) => chaveNome(l.responsavel) === chaveNome(de) && !l.completo).map((l) => l.empresa.id);
    if (!ids.length) throw new Error(txt(de) + " não tem empresas com pendência neste setor e mês.");
    const d = dados();
    ids.forEach((id) => { gravarResp(d, setorId, id, para, mes); });
    d.bastao.unshift({ id: novoId("b-"), mes, setor: setorId, de: txt(de), para: txt(para), motivo: txt(motivo), empresas: ids, em: hoje() });
    gravar(d);
    return { qtd: ids.length, desfazer: () => { if (antes === null) ls.removeItem && ls.removeItem(CHAVE); else ls.setItem(CHAVE, antes); avisar(); } };
  }
  /** Devolve as empresas de uma passagem para quem tinha saído (quando a pessoa volta). */
  function devolverBastao(id) {
    const d = dados();
    const b = d.bastao.find((x) => x.id === id);
    if (!b || b.devolvido) throw new Error("Passagem não encontrada.");
    b.empresas.forEach((e) => { if (chaveNome(respNoMes(d, b.setor, e, b.mes)) === chaveNome(b.para)) gravarResp(d, b.setor, e, b.de, b.mes); });
    b.devolvido = hoje();
    gravar(d);
  }
  function historicoBastao() { return dados().bastao; }

  // ------------------------------------------------------------ diário
  function anotar(pessoa, setorId, texto, data) {
    if (!txt(texto)) throw new Error("Escreva o que fez ou onde parou.");
    if (!txt(pessoa)) throw new Error("Falta o nome.");
    const d = dados();
    const n = { id: novoId("n-"), data: data || hoje(), pessoa: txt(pessoa), setor: setorId || "", texto: txt(texto) };
    d.diario.unshift(n);
    d.diario = d.diario.slice(0, 3000);   // guarda as últimas 3 mil anotações
    gravar(d);
    return n;
  }
  function excluirAnotacao(id) { const d = dados(); d.diario = d.diario.filter((x) => x.id !== id); gravar(d); }
  /** Anotações dos últimos dias, mais novas primeiro, agrupadas por data. */
  function diario(filtro, dias = 30) {
    const f = filtro || {};
    const lim = new Date(agora().getTime() - dias * 86400000).toISOString().slice(0, 10);
    const grupos = [];
    dados().diario.filter((x) => x.data >= lim && (!f.pessoa || chaveNome(x.pessoa) === chaveNome(f.pessoa)) && (!f.setor || x.setor === f.setor))
      .sort((a, b) => b.data.localeCompare(a.data))
      .forEach((x) => { let g = grupos[grupos.length - 1]; if (!g || g.data !== x.data) grupos.push(g = { data: x.data, itens: [] }); g.itens.push(x); });
    return grupos;
  }

  // ------------------------------------------------------------ importar
  /**
   * CSV de gestão de entregas (S3D e parecidos): Obrigação / Tarefa; Empresa; CNPJ; Status; Departamento;
   * Responsável prazo / entrega; Competência. Devolve o plano para conferir; aplicarImportacao grava.
   */
  function lerEntregas(linhas) {
    const cab = (linhas[0] || []).map(chaveNome);
    const col = (...nomes) => cab.findIndex((c) => nomes.some((n) => c === n || c.indexOf(n) === 0));
    const c = { obr: col("obrigacao / tarefa", "obrigacao", "tarefa"), emp: col("empresa", "razao social"), cnpj: col("cnpj"), st: col("status", "situacao"),
      dep: col("departamento", "setor"), rp: col("responsavel prazo", "responsavel"), re: col("responsavel entrega"), comp: col("competencia") };
    if (c.obr < 0 || c.emp < 0 || c.st < 0) return { erro: "Não reconheci as colunas (precisa de Obrigação, Empresa e Status)." };
    const itens = [], avisos = [];
    linhas.slice(1).forEach((l, i) => {
      if (!l || !txt(l[c.emp]) || !txt(l[c.obr])) return;
      const comp = /(\d{1,2})\/(\d{4})/.exec(txt(l[c.comp]));
      if (!comp) { avisos.push("Linha " + (i + 2) + ": sem competência."); return; }
      const dep = txt(l[c.dep]);
      itens.push({ obrigacao: txt(l[c.obr]), empresa: txt(l[c.emp]), cnpj: c.cnpj > -1 ? txt(l[c.cnpj]) : "", status: statusDeTexto(l[c.st]),
        departamento: dep, setor: setorDoDepartamento(dep), responsavel: txt(l[c.rp] || (c.re > -1 ? l[c.re] : "")),
        mes: comp[2] + "-" + comp[1].padStart(2, "0") });
    });
    return { itens, avisos };
  }
  /**
   * Planilha de controle (empresas nas linhas, obrigações nas colunas): Empresa, CNPJ e as colunas até
   * "Finalizado"/"Observações". O setor e a competência vêm da tela.
   */
  function lerControle(linhas, setorId, mes) {
    const h = linhas.findIndex((r, i) => i < 10 && (r || []).some((x) => chaveNome(x) === "empresa"));
    if (h < 0) return { erro: "Não achei a coluna Empresa nas primeiras linhas." };
    const cab = linhas[h].map(txt);
    const iEmp = cab.findIndex((x) => chaveNome(x) === "empresa"), iCnpj = cab.findIndex((x) => chaveNome(x) === "cnpj");
    const iObs = cab.findIndex((x) => /^observ/.test(chaveNome(x)));
    const obrig = cab.map((x, i) => ({ nome: x, i })).filter((x) => x.nome && x.i !== iEmp && x.i !== iCnpj && x.i !== iObs &&
      !/^(cod|codigo|finalizado|status|responsavel)/.test(chaveNome(x.nome)));
    const itens = [];
    linhas.slice(h + 1).forEach((r) => {
      if (!r || !txt(r[iEmp])) return;
      obrig.forEach((o) => {
        const v = txt(r[o.i]);
        itens.push({ obrigacao: o.nome, empresa: txt(r[iEmp]), cnpj: iCnpj > -1 ? txt(r[iCnpj]) : "", status: statusDeTexto(v), setor: setorId, mes, obs: iObs > -1 ? txt(r[iObs]) : "", vazio: !v });
      });
    });
    return { itens, avisos: [], obrigacoes: obrig.map((o) => o.nome) };
  }
  /** Grava o plano: cria empresas, setores e colunas que faltam; não apaga o que já está marcado como feito. */
  function aplicarImportacao(itens) {
    const d = dados();
    let empresasNovas = 0, marcados = 0;
    const antesEmp = empresas().length;
    itens.forEach((it) => {
      const s = garantirSetor(d, it.setor, it.departamento || it.setor);
      if (!s.obrigacoes.some((o) => chaveNome(o) === chaveNome(it.obrigacao))) s.obrigacoes.push(it.obrigacao);
      const obr = s.obrigacoes.find((o) => chaveNome(o) === chaveNome(it.obrigacao));
      const c = empresaPara(it.empresa, it.cnpj, true);
      if (it.responsavel && !((d.responsaveis[s.id] || {})[c.id])) gravarResp(d, s.id, c.id, it.responsavel, "");
      if (it.status && !it.vazio) {
        const st = celulasDe(d, it.mes, c.id, s.id);
        if (!st[obr] || st[obr].s !== "feito") { st[obr] = { s: it.status, por: "importado", em: hoje() }; marcados++; }
      }
      if (it.obs) {
        const m = d.obs[it.mes] = d.obs[it.mes] || {};
        const o = m[c.id] = m[c.id] || {};
        if (!o[s.id]) o[s.id] = it.obs;
      }
    });
    empresasNovas = empresas().length - antesEmp;
    gravar(d);
    return { empresasNovas, marcados, setores: d.setores.length };
  }

  // ------------------------------------------------------------ demonstração e limpar
  function carregarDemonstracao(exemploEmpresas) {
    const d = dados();
    if (Object.keys(d.status).length) return false;   // responsáveis já definidos (no cadastro de empresas) são mantidos
    let lista = empresas();
    if (!lista.length && exemploEmpresas) {
      const e = cadastro(); e.clientes = exemploEmpresas; ls.setItem("painelVencimentos:v1", JSON.stringify(e)); lista = empresas();
    }
    const nomes = ["Ana", "Bruno", "Carla"], mes = mesPadrao();
    // o mês de trabalho fica pela metade; os meses anteriores do ano, quase todos feitos (para a visão anual)
    const meses = [];
    for (let m = 1; m <= Number(mes.slice(5)); m++) meses.push(mes.slice(0, 5) + String(m).padStart(2, "0"));
    d.setores.forEach((s, k) => {
      const r = d.responsaveis[s.id] = d.responsaveis[s.id] || {};
      lista.forEach((c, i) => {
        if (!r[c.id]) gravarResp(d, s.id, c.id, nomes[(i + k) % nomes.length], "");
        meses.forEach((mm, n) => {
          const atual = mm === mes, falta = meses.length - 1 - n;
          s.obrigacoes.forEach((o, j) => {
            const v = (i * 3 + j * 2 + k + n) % 5;
            const feito = atual ? v < 3 : falta > 2 || v !== 0 || (falta === 1 && j % 2);
            if (feito) celulasDe(d, mm, c.id, s.id)[o] = { s: "feito", por: nomes[(i + k) % 3], em: hoje() };
            else if (atual && v === 4 && j === s.obrigacoes.length - 1) celulasDe(d, mm, c.id, s.id)[o] = { s: "na", por: "", em: hoje() };
          });
        });
      });
    });
    // fechamento contábil: os meses anteriores quase todos fechados, o de trabalho pela metade
    lista.filter((c) => !ehFilial(c.documento)).forEach((c, i) => {
      meses.forEach((mm, n) => { const falta = meses.length - 1 - n; if (falta > 1 || (falta === 1 && i % 3 !== 2) || (falta === 0 && i % 2 === 0)) (d.fechados[c.id] = d.fechados[c.id] || {})[mm] = { por: nomes[i % 3], em: hoje() }; });
    });
    d.diario = [{ id: "ex-n1", data: hoje(), pessoa: "Ana", setor: "dp", texto: "Folhas conferidas; falta o FGTS de 2 empresas (exemplo)." },
      { id: "ex-n2", data: hoje(), pessoa: "Bruno", setor: "fiscal", texto: "Apuração feita até a metade da lista; parei na letra G (exemplo)." }].concat(d.diario);
    gravar(d);
    return true;
  }
  function limpar() {
    const antes = ls.getItem(CHAVE);
    const d = dados();
    ls.setItem(CHAVE, JSON.stringify({ setores: d.setores, regras: d.regras }));   // responsáveis e histórico saem junto
    avisar();
    return () => { if (antes !== null) { ls.setItem(CHAVE, antes); avisar(); } };
  }

  return {
    hoje, mesPadrao, setores, salvarObrigacoes, empresas, empresaPara, ocultar, responsavel, todosResponsaveis, definirResponsavel, historicoResponsavel, importarHistorico,
    definirStatus, definirObs, grade, anual, pessoas, resumo, marcarFechado, fechamento, resumoFechamento, passarBastao, devolverBastao, historicoBastao,
    anotar, excluirAnotacao, diario, lerEntregas, lerControle, aplicarImportacao, carregarDemonstracao, limpar
  };
}
