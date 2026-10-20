/*
 * Em Dia (simples): o que cada um faz no mês, numa grade como a planilha de controle de entregas.
 * Empresas nas linhas, obrigações de cada setor nas colunas, situação em cada célula, por competência.
 * Mais a passagem de bastão (quando alguém falta) e um diário curto.
 *
 * As empresas são as mesmas do Departamento Cadastro (chave "painelVencimentos:v1"), para ninguém cadastrar
 * duas vezes. O resto fica em "emDia:v2" (a versão antiga, "emDia:v1", não é apagada).
 * Sem tela; testado em tests/emDia.test.js.
 */

export const CHAVE = "emDia:v2";
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
      responsaveis: e.responsaveis || {}, status: e.status || {}, obs: e.obs || {}, ocultas: e.ocultas || {},
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
  function setores() { return dados().setores; }
  function salvarObrigacoes(setorId, lista) {
    const limpa = [];
    lista.map(txt).filter(Boolean).forEach((o) => { if (!limpa.some((x) => chaveNome(x) === chaveNome(o))) limpa.push(o); });
    if (!limpa.length) throw new Error("Deixe pelo menos uma obrigação.");
    const d = dados();
    const s = d.setores.find((x) => x.id === setorId);
    if (!s) throw new Error("Setor não encontrado.");
    s.obrigacoes = limpa;
    gravar(d);
  }
  function garantirSetor(d, id, nome) {
    let s = d.setores.find((x) => x.id === id || chaveNome(x.nome) === chaveNome(nome));
    if (!s) { s = { id: id || novoId("set-"), nome: nome || id, obrigacoes: [] }; d.setores.push(s); }
    return s;
  }

  // ------------------------------------------------------------ empresas (as do Departamento Cadastro)
  function empresas() { return cadastro().clientes.slice().sort((a, b) => txt(a.nome).localeCompare(txt(b.nome), "pt-BR")); }
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
  function responsavel(setorId, empresaId) { return ((dados().responsaveis[setorId] || {})[empresaId]) || ""; }
  function definirResponsavel(setorId, empresaId, nome) {
    const d = dados();
    const r = d.responsaveis[setorId] = d.responsaveis[setorId] || {};
    if (txt(nome)) r[empresaId] = txt(nome); else delete r[empresaId];
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
    const setor = d.setores.find((s) => s.id === setorId) || d.setores[0];
    const ocultas = new Set(d.ocultas[setor.id] || []);
    const resp = d.responsaveis[setor.id] || {};
    const st = d.status[mes] || {};
    const obs = d.obs[mes] || {};
    const f = filtro || {};
    let linhas = empresas().filter((c) => !ocultas.has(c.id)).map((c) => {
      const s = (st[c.id] || {})[setor.id] || {};
      const celulas = setor.obrigacoes.map((o) => ({ obrigacao: o, status: (s[o] || {}).s || "", por: (s[o] || {}).por || "", em: (s[o] || {}).em || "" }));
      const valem = celulas.filter((x) => x.status !== "na");
      const feitas = valem.filter((x) => x.status === "feito").length;
      return { empresa: c, responsavel: resp[c.id] || "", celulas, feitas, total: valem.length, completo: valem.length > 0 && feitas === valem.length, obs: (obs[c.id] || {})[setor.id] || "" };
    });
    if (f.pessoa) linhas = linhas.filter((l) => (f.pessoa === "(sem)" ? !l.responsavel : chaveNome(l.responsavel) === chaveNome(f.pessoa) || ehMesmaPessoa(l.responsavel, f.pessoaObj)));
    if (f.pendentes) linhas = linhas.filter((l) => !l.completo);
    if (f.busca) { const b = chaveNome(f.busca); linhas = linhas.filter((l) => chaveNome(l.empresa.nome).indexOf(b) > -1 || digitos(l.empresa.documento).indexOf(digitos(f.busca) || "§") > -1); }
    const porPessoa = {};
    let feitas = 0, total = 0;
    linhas.forEach((l) => {
      const k = l.responsavel || "(sem responsável)";
      const p = porPessoa[k] = porPessoa[k] || { pessoa: k, feitas: 0, total: 0, empresas: 0 };
      p.feitas += l.feitas; p.total += l.total; p.empresas++;
      feitas += l.feitas; total += l.total;
    });
    return {
      setor, linhas, feitas, total, pct: total ? Math.round(feitas / total * 100) : 0,
      porPessoa: Object.values(porPessoa).sort((a, b) => a.pessoa.localeCompare(b.pessoa, "pt-BR")),
      ocultas: empresas().filter((c) => ocultas.has(c.id))
    };
  }
  /** Pessoas que aparecem como responsáveis (para as listas de escolha). */
  function pessoas() {
    const d = dados(), s = new Set();
    Object.values(d.responsaveis).forEach((r) => Object.values(r).forEach((n) => s.add(n)));
    d.diario.forEach((x) => s.add(x.pessoa));
    return Array.from(s).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
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
    const r = d.responsaveis[setorId] = d.responsaveis[setorId] || {};
    ids.forEach((id) => { r[id] = txt(para); });
    d.bastao.unshift({ id: novoId("b-"), mes, setor: setorId, de: txt(de), para: txt(para), motivo: txt(motivo), empresas: ids, em: hoje() });
    gravar(d);
    return { qtd: ids.length, desfazer: () => { if (antes === null) ls.removeItem && ls.removeItem(CHAVE); else ls.setItem(CHAVE, antes); avisar(); } };
  }
  /** Devolve as empresas de uma passagem para quem tinha saído (quando a pessoa volta). */
  function devolverBastao(id) {
    const d = dados();
    const b = d.bastao.find((x) => x.id === id);
    if (!b || b.devolvido) throw new Error("Passagem não encontrada.");
    const r = d.responsaveis[b.setor] = d.responsaveis[b.setor] || {};
    b.empresas.forEach((e) => { if (chaveNome(r[e]) === chaveNome(b.para)) r[e] = b.de; });
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
      if (it.responsavel) { const r = d.responsaveis[s.id] = d.responsaveis[s.id] || {}; if (!r[c.id]) r[c.id] = it.responsavel; }
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
    if (Object.keys(d.status).length || Object.keys(d.responsaveis).length) return false;
    let lista = empresas();
    if (!lista.length && exemploEmpresas) {
      const e = cadastro(); e.clientes = exemploEmpresas; ls.setItem("painelVencimentos:v1", JSON.stringify(e)); lista = empresas();
    }
    const nomes = ["Ana", "Bruno", "Carla"], mes = mesPadrao();
    d.setores.forEach((s, k) => {
      d.responsaveis[s.id] = {};
      lista.forEach((c, i) => {
        d.responsaveis[s.id][c.id] = nomes[(i + k) % nomes.length];
        s.obrigacoes.forEach((o, j) => {
          const v = (i * 3 + j * 2 + k) % 5;
          if (v < 3) celulasDe(d, mes, c.id, s.id)[o] = { s: "feito", por: nomes[(i + k) % 3], em: hoje() };
          else if (v === 4 && j === s.obrigacoes.length - 1) celulasDe(d, mes, c.id, s.id)[o] = { s: "na", por: "", em: hoje() };
        });
      });
    });
    d.diario = [{ id: "ex-n1", data: hoje(), pessoa: "Ana", setor: "dp", texto: "Folhas conferidas; falta o FGTS de 2 empresas (exemplo)." },
      { id: "ex-n2", data: hoje(), pessoa: "Bruno", setor: "fiscal", texto: "Apuração feita até a metade da lista; parei na letra G (exemplo)." }].concat(d.diario);
    gravar(d);
    return true;
  }
  function limpar() {
    const antes = ls.getItem(CHAVE);
    ls.setItem(CHAVE, JSON.stringify({ setores: dados().setores }));
    avisar();
    return () => { if (antes !== null) { ls.setItem(CHAVE, antes); avisar(); } };
  }

  return {
    hoje, mesPadrao, setores, salvarObrigacoes, empresas, empresaPara, ocultar, responsavel, definirResponsavel,
    definirStatus, definirObs, grade, pessoas, resumo, passarBastao, devolverBastao, historicoBastao,
    anotar, excluirAnotacao, diario, lerEntregas, lerControle, aplicarImportacao, carregarDemonstracao, limpar
  };
}
