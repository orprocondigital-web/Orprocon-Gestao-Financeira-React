/*
 * Distribuição de lucros e REINF (vindos do sistema do Depto. Contábil).
 *
 * Distribuição: empresa, sócio, data do pagamento, base, IRRF, líquido, retenção, aprovada em ata,
 * competência da REINF e observação. Cálculo como no sistema antigo: informando o líquido,
 * base = líquido ÷ 90 × 100 e IRRF = 10% da base (informando o bruto: IRRF = 10% e líquido = 90%).
 * Saldo de ata por empresa: o que já foi aprovado em ata e ainda pode ser distribuído sem IRRF.
 * REINF: por competência, as empresas (matrizes) com a quantidade de notas de serviço, o que foi
 * distribuído no mês e se já foi confirmada; o prazo do mês é definido na tela.
 *
 * As empresas e os sócios vêm do cadastro (Departamento Cadastro). Dados em "lucros:v1".
 * Sem tela; testado em tests/lucros.test.js.
 */
import { ativaNoMes, ehFilial, raizCnpj } from "./depCadastro.mjs";

export const CHAVE = "lucros:v1";
export const ALIQUOTA = 0.10;
/** Lei 15.270/2025: retenção de 10% quando o total pago ao mesmo sócio no mês passa de R$ 50 mil. */
export const LIMITE_MENSAL = 50000;
export const CODIGO_DARF = "1841";

const txt = (v) => (v === null || v === undefined ? "" : String(v).trim());
const iso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const chave = (s) => txt(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

/** Base, IRRF e líquido. modo "liquido": o valor é o que o sócio recebe; "bruto": o valor é a base. */
export function calcular(valor, modo, retencao) {
  const v = r2(Math.abs(Number(valor) || 0));
  if (!retencao) return { base: v, irrf: 0, liquido: v };
  if (modo === "bruto") { const irrf = r2(v * ALIQUOTA); return { base: v, irrf, liquido: r2(v - irrf) }; }
  const base = r2(v / 90 * 100);
  return { base, irrf: r2(base * ALIQUOTA), liquido: v };
}

/** Sábado e domingo voltam para a sexta (vencimento de tributo federal é antecipado). */
function diaUtilAntes(d) {
  const w = d.getUTCDay();
  if (w === 6) d.setUTCDate(d.getUTCDate() - 1);
  if (w === 0) d.setUTCDate(d.getUTCDate() - 2);
  return d.toISOString().slice(0, 10);
}
/** DARF do IRRF: dia 20 do mês seguinte ao pagamento. */
export function prazoDarf(dataPagamento) {
  if (!iso(dataPagamento)) return "";
  const [a, m] = dataPagamento.split("-").map(Number);
  return diaUtilAntes(new Date(Date.UTC(a, m, 20)));
}
/** REINF com retenção: dia 15 do mês seguinte à competência (AAAA-MM). */
export function prazoReinf(comp) {
  if (!/^\d{4}-\d{2}$/.test(comp || "")) return "";
  const [a, m] = comp.split("-").map(Number);
  return diaUtilAntes(new Date(Date.UTC(a, m, 15)));
}

/** deps: { ls, agora?, aoMudar? } */
export function criarLucros(deps) {
  const { ls } = deps;
  const agora = deps.agora || (() => new Date());
  const avisar = () => { if (deps.aoMudar) deps.aoMudar(); };
  let seq = 0;
  const novoId = (p) => p + agora().getTime().toString(36) + (seq++).toString(36);
  const hoje = () => { const d = agora(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const mesPadrao = () => { const d = agora(); const m = new Date(d.getFullYear(), d.getMonth() - 1, 1); return m.getFullYear() + "-" + String(m.getMonth() + 1).padStart(2, "0"); };

  function ler(k) { try { const v = JSON.parse(ls.getItem(k) || "null"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }
  function dados() {
    const e = ler(CHAVE);
    return { distribuicoes: Array.isArray(e.distribuicoes) ? e.distribuicoes : [], saldoAta: e.saldoAta || {}, reinf: e.reinf || {} };
  }
  function gravar(d) { ls.setItem(CHAVE, JSON.stringify(d)); avisar(); }

  // ------------------------------------------------------------ empresas e sócios (do cadastro)
  /** Matrizes (a filial distribui pela matriz), com os sócios. mes: só as que eram clientes no mês. */
  function empresas(mes) {
    const cad = ler("painelVencimentos:v1");
    const lista = Array.isArray(cad.clientes) ? cad.clientes : [];
    const filiais = {};
    lista.forEach((c) => { if (ehFilial(c.documento)) { const r = raizCnpj(c.documento); filiais[r] = (filiais[r] || 0) + 1; } });
    return lista.filter((c) => !ehFilial(c.documento) && (!mes || ativaNoMes(c, mes)))
      .map((c) => Object.assign({}, c, { socios: Array.isArray(c.socios) ? c.socios : [], filiais: filiais[raizCnpj(c.documento)] || 0 }))
      .sort((a, b) => txt(a.nome).localeCompare(txt(b.nome), "pt-BR"));
  }
  const nomeEmpresa = () => { const n = {}; (ler("painelVencimentos:v1").clientes || []).forEach((c) => { n[c.id] = c.nome; }); return n; };

  // ------------------------------------------------------------ distribuições
  /** Total já pago (base) ao sócio pela empresa no mês da data, sem contar um id (para editar). */
  function pagoNoMes(empresaId, socio, data, semId) {
    const mes = String(data || "").slice(0, 7);
    return r2(dados().distribuicoes.filter((x) => x.id !== semId && x.empresaId === empresaId && chave(x.socio) === chave(socio) && x.data.slice(0, 7) === mes && !x.ata)
      .reduce((t, x) => t + x.base, 0));
  }
  /**
   * Sugestão de retenção para um pagamento novo: retém quando o total do mês (com este) passa do limite.
   * Lucro aprovado em ata não entra (é o saldo de exercícios anteriores).
   */
  function sugerirRetencao(empresaId, socio, data, valorBase, semId) {
    const antes = pagoNoMes(empresaId, socio, data, semId);
    const total = r2(antes + (Number(valorBase) || 0));
    return { antes, total, reter: total > LIMITE_MENSAL };
  }
  function saldoAta(empresaId) {
    const d = dados();
    const inicial = r2(d.saldoAta[empresaId] || 0);
    const usado = r2(d.distribuicoes.filter((x) => x.empresaId === empresaId && x.ata).reduce((t, x) => t + x.liquido, 0));
    return { inicial, usado, saldo: r2(inicial - usado) };
  }
  function definirSaldoAta(empresaId, valor) {
    const d = dados();
    const v = r2(valor);
    if (v < 0) throw new Error("O saldo não pode ser negativo.");
    if (v) d.saldoAta[empresaId] = v; else delete d.saldoAta[empresaId];
    gravar(d);
  }

  /** dist: { empresaId, socio, data, valor, modo, retencao, ata, compReinf, obs }. Devolve o registro gravado. */
  function salvar(dist, id) {
    const empresaId = txt(dist.empresaId), socio = txt(dist.socio);
    if (!empresaId) throw new Error("Escolha a empresa.");
    if (!socio) throw new Error("Escolha ou digite o sócio.");
    if (!iso(dist.data)) throw new Error("Preencha a data do pagamento.");
    if (!(Number(dist.valor) > 0)) throw new Error("Preencha o valor.");
    if (dist.ata && dist.retencao) throw new Error("Lucro aprovado em ata não tem retenção: desmarque uma das duas.");
    const c = calcular(dist.valor, dist.modo, !!dist.retencao);
    const compReinf = /^\d{4}-\d{2}$/.test(dist.compReinf || "") ? dist.compReinf : dist.data.slice(0, 7);
    const d = dados();
    if (dist.ata) {
      const s = saldoAta(empresaId);
      const antes = id ? (d.distribuicoes.find((x) => x.id === id && x.ata) || { liquido: 0 }).liquido : 0;
      if (s.inicial && c.liquido > r2(s.saldo + antes)) throw new Error("Passa do saldo de ata (" + s.saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) + ").");
    }
    const reg = { empresaId, socio, data: dist.data, base: c.base, irrf: c.irrf, liquido: c.liquido, retencao: !!dist.retencao, ata: !!dist.ata, compReinf, obs: txt(dist.obs) };
    let salvo;
    if (id) d.distribuicoes = d.distribuicoes.map((x) => (x.id === id ? (salvo = Object.assign({}, x, reg)) : x));
    else d.distribuicoes.push(salvo = Object.assign({ id: novoId("dl-"), criadoEm: hoje() }, reg));
    if (!salvo) throw new Error("Distribuição não encontrada.");
    gravar(d);
    return salvo;
  }
  function excluir(id) {
    const d = dados();
    const pos = d.distribuicoes.findIndex((x) => x.id === id);
    if (pos < 0) return null;
    const [rem] = d.distribuicoes.splice(pos, 1);
    gravar(d);
    return () => { const a = dados(); if (!a.distribuicoes.some((x) => x.id === id)) { a.distribuicoes.splice(Math.min(pos, a.distribuicoes.length), 0, rem); gravar(a); } };
  }
  /** Histórico (mais novo primeiro) e totais. filtro: { ano, empresaId, busca }. */
  function historico(filtro) {
    const f = filtro || {}, nomes = nomeEmpresa(), b = chave(f.busca);
    const lista = dados().distribuicoes.filter((x) => (!f.ano || x.data.slice(0, 4) === String(f.ano)) && (!f.empresaId || x.empresaId === f.empresaId))
      .map((x) => Object.assign({}, x, { empresa: nomes[x.empresaId] || "(empresa excluída)" }))
      .filter((x) => !b || chave(x.empresa).indexOf(b) > -1 || chave(x.socio).indexOf(b) > -1)
      .sort((a, c) => c.data.localeCompare(a.data) || c.id.localeCompare(a.id));
    const tot = { distribuido: 0, irrf: 0, base: 0, qtd: lista.length, comRetencao: 0 };
    lista.forEach((x) => { tot.distribuido += x.liquido; tot.irrf += x.irrf; tot.base += x.base; if (x.irrf > 0) tot.comRetencao++; });
    ["distribuido", "irrf", "base"].forEach((k) => { tot[k] = r2(tot[k]); });
    return { lista, totais: tot };
  }
  /** Total por sócio no ano (para conferir com o informe de rendimentos). */
  function porSocio(ano, empresaId) {
    const m = {};
    historico({ ano, empresaId }).lista.forEach((x) => {
      const k = x.empresaId + "|" + chave(x.socio);
      const s = m[k] = m[k] || { empresa: x.empresa, socio: x.socio, base: 0, irrf: 0, liquido: 0 };
      s.base = r2(s.base + x.base); s.irrf = r2(s.irrf + x.irrf); s.liquido = r2(s.liquido + x.liquido);
    });
    return Object.values(m).sort((a, b) => a.empresa.localeCompare(b.empresa, "pt-BR") || a.socio.localeCompare(b.socio, "pt-BR"));
  }

  // ------------------------------------------------------------ REINF
  function prazoDoMes(comp) { return (dados().reinf[comp] || {}).prazo || prazoReinf(comp); }
  function definirPrazo(comp, data) {
    if (data && !iso(data)) throw new Error("Data inválida.");
    const d = dados();
    const r = d.reinf[comp] = d.reinf[comp] || {};
    if (data) r.prazo = data; else delete r.prazo;
    gravar(d);
  }
  /** As empresas da competência com notas, distribuído no mês e situação. */
  function reinf(comp) {
    const d = dados(), r = (d.reinf[comp] || {}).empresas || {};
    const dist = {};
    d.distribuicoes.filter((x) => x.compReinf === comp).forEach((x) => {
      const e = dist[x.empresaId] = dist[x.empresaId] || { liquido: 0, irrf: 0, qtd: 0 };
      e.liquido = r2(e.liquido + x.liquido); e.irrf = r2(e.irrf + x.irrf); e.qtd++;
    });
    const linhas = empresas(comp).map((c) => {
      const e = r[c.id] || {};
      return { empresa: c, notas: e.notas === undefined ? "" : e.notas, confirmado: !!e.confirmado, distribuido: dist[c.id] || null };
    });
    const confirmadas = linhas.filter((l) => l.confirmado).length;
    return { comp, prazo: prazoDoMes(comp), prazoPadrao: prazoReinf(comp), linhas, total: linhas.length, confirmadas, pendentes: linhas.length - confirmadas };
  }
  function celula(d, comp, empresaId) {
    const r = d.reinf[comp] = d.reinf[comp] || {};
    const e = r.empresas = r.empresas || {};
    return e[empresaId] = e[empresaId] || {};
  }
  function definirNotas(comp, empresaId, qtd) {
    const d = dados();
    const c = celula(d, comp, empresaId);
    if (qtd === "" || qtd === null || qtd === undefined) delete c.notas;
    else { const n = parseInt(qtd, 10); if (!(n >= 0)) throw new Error("Quantidade inválida."); c.notas = n; }
    gravar(d);
  }
  function confirmar(comp, empresaId, sim) {
    const d = dados();
    const c = celula(d, comp, empresaId);
    if (sim) { c.confirmado = true; c.em = hoje(); } else { delete c.confirmado; delete c.em; }
    gravar(d);
  }

  // ------------------------------------------------------------ demonstração e limpar
  function carregarDemonstracao() {
    const d = dados();
    if (d.distribuicoes.length) return false;
    const lista = empresas().filter((c) => c.socios.length);
    if (!lista.length) return false;
    const ano = agora().getFullYear(), mesAtual = agora().getMonth() + 1;
    lista.forEach((c, i) => {
      if (i === 0) d.saldoAta[c.id] = 120000;
      c.socios.forEach((s, j) => {
        for (let m = 1; m < mesAtual; m += 3) {
          const data = ano + "-" + String(m).padStart(2, "0") + "-" + String(10 + j).padStart(2, "0");
          const valor = Math.round((18000 + i * 9000 + j * 4000) * (s.percentual || 50) / 50);
          const ret = valor > LIMITE_MENSAL;
          const calc = calcular(valor, "liquido", ret);
          d.distribuicoes.push({ id: "ex-dl" + i + "-" + j + "-" + m, empresaId: c.id, socio: s.nome, data, base: calc.base, irrf: calc.irrf, liquido: calc.liquido,
            retencao: ret, ata: false, compReinf: data.slice(0, 7), obs: "Exemplo", criadoEm: hoje() });
        }
      });
      if (i === 0 && c.socios[0]) d.distribuicoes.push({ id: "ex-dl-ata", empresaId: c.id, socio: c.socios[0].nome, data: ano + "-02-05", base: 30000, irrf: 0, liquido: 30000,
        retencao: false, ata: true, compReinf: ano + "-02", obs: "Lucros de 2025 aprovados em ata (exemplo)", criadoEm: hoje() });
    });
    const comp = mesPadrao();
    lista.forEach((c, i) => { const e = celula(d, comp, c.id); e.notas = i * 3; if (i % 2 === 0) { e.confirmado = true; e.em = hoje(); } });
    gravar(d);
    return true;
  }
  function limpar() {
    const antes = ls.getItem(CHAVE);
    ls.setItem(CHAVE, JSON.stringify({}));
    avisar();
    return () => { if (antes !== null) { ls.setItem(CHAVE, antes); avisar(); } };
  }

  return {
    hoje, mesPadrao, empresas, salvar, excluir, historico, porSocio, pagoNoMes, sugerirRetencao, saldoAta, definirSaldoAta,
    reinf, prazoDoMes, definirPrazo, definirNotas, confirmar, carregarDemonstracao, limpar
  };
}
