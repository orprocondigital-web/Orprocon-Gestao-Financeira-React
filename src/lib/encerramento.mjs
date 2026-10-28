/*
 * Encerramento contábil do exercício (vindo do sistema do Depto. Contábil).
 *
 * Por empresa e ano: estoque inicial, compras, estoque final, receita bruta, resultado antes do
 * estoque e resultado do período. Cálculos:
 *   CMV = estoque inicial + compras − estoque final
 *   lucro bruto apurado = receita bruta − CMV        (% = lucro bruto ÷ receita × 100)
 *   resultado do período sugerido = resultado antes do estoque + estoque final − estoque inicial
 *     (troca as compras, lançadas como custo, pelo CMV; pode ser informado à mão)
 * A matriz encerra com as filiais: cada unidade tem os seus números e o consolidado soma todas.
 * Status do grupo: pendente ou encerrado (só encerra com os números de todas as unidades).
 *
 * As empresas vêm do cadastro (Departamento Cadastro). Dados em "encerramento:v1".
 * Sem tela; testado em tests/encerramento.test.js.
 */
import { ativaNoMes, ehFilial, raizCnpj } from "./depCadastro.mjs";

export const CHAVE = "encerramento:v1";
export const CAMPOS = [
  ["estoqueInicial", "Estoque inicial"],
  ["compras", "Compras"],
  ["estoqueFinal", "Estoque final"],
  ["receitaBruta", "Receita bruta"],
  ["resultadoAntesEstoque", "Resultado antes do estoque"],
  ["resultadoPeriodo", "Resultado do período"]
];
/** Sem estes o grupo não encerra (os dois resultados são opcionais). */
export const OBRIGATORIOS = ["estoqueInicial", "compras", "estoqueFinal", "receitaBruta"];

const txt = (v) => (v === null || v === undefined ? "" : String(v).trim());
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : r2(v));
const chave = (s) => txt(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

/** Os cálculos de uma unidade (ou do consolidado). Campos vazios contam como zero, mas o resultado só aparece se der para calcular. */
export function calcular(d) {
  d = d || {};
  const v = (k) => num(d[k]);
  const temCmv = v("estoqueInicial") !== null || v("compras") !== null || v("estoqueFinal") !== null;
  const cmv = temCmv ? r2((v("estoqueInicial") || 0) + (v("compras") || 0) - (v("estoqueFinal") || 0)) : null;
  const receita = v("receitaBruta");
  const lucroBruto = receita !== null || cmv !== null ? r2((receita || 0) - (cmv || 0)) : null;
  const pct = receita ? Math.round((lucroBruto / receita) * 1000) / 10 : null;
  const rae = v("resultadoAntesEstoque");
  const sugerido = rae !== null ? r2(rae + (v("estoqueFinal") || 0) - (v("estoqueInicial") || 0)) : null;
  const informado = v("resultadoPeriodo");
  return { cmv, lucroBruto, pct, resultadoSugerido: sugerido, resultado: informado !== null ? informado : sugerido, resultadoInformado: informado !== null };
}
/**
 * Rateio por faturamento (como no sistema do Depto. Contábil): cada sócio recebe a parte do valor total na proporção
 * do faturamento que gerou. pct = faturamento ÷ soma × 100; valor = faturamento ÷ soma × total.
 * Os centavos que sobram do arredondamento vão para quem tem a maior fração, para a soma bater com o total.
 * faturamentos: números (null ou negativo contam como 0). Devolve { soma, total, linhas: [{ faturamento, pct, valor }] }.
 */
export function ratear(total, faturamentos) {
  const t = r2(Math.abs(Number(total) || 0));
  const fats = (faturamentos || []).map((f) => Math.max(0, Number(f) || 0));
  const soma = r2(fats.reduce((a, b) => a + b, 0));
  if (!soma || !t) return { soma, total: t, linhas: fats.map((f) => ({ faturamento: f, pct: soma ? r2((f / soma) * 100) : 0, valor: 0 })) };
  const centavos = Math.round(t * 100);
  const exatos = fats.map((f) => (f / soma) * centavos);
  const base = exatos.map(Math.floor);
  let sobra = centavos - base.reduce((a, b) => a + b, 0);
  exatos.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (sobra > 0 && fats[i] > 0) { base[i]++; sobra--; } });
  return { soma, total: t, linhas: fats.map((f, i) => ({ faturamento: f, pct: r2((f / soma) * 100), valor: base[i] / 100 })) };
}

export const completa = (d) => OBRIGATORIOS.every((k) => num((d || {})[k]) !== null);

/** deps: { ls, agora?, aoMudar? } */
export function criarEncerramento(deps) {
  const { ls } = deps;
  const agora = deps.agora || (() => new Date());
  const avisar = () => { if (deps.aoMudar) deps.aoMudar(); };
  const hoje = () => { const d = agora(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  /** Até abril ainda se encerra o ano anterior. */
  const anoPadrao = () => { const d = agora(); return String(d.getMonth() < 4 ? d.getFullYear() - 1 : d.getFullYear()); };

  function ler(k) { try { const v = JSON.parse(ls.getItem(k) || "null"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }
  function dados() { const e = ler(CHAVE); return { anos: e.anos && typeof e.anos === "object" ? e.anos : {} }; }
  function doAno(d, ano) { const a = d.anos[ano] = d.anos[ano] || {}; a.unidades = a.unidades || {}; a.grupos = a.grupos || {}; return a; }
  function gravar(d) { ls.setItem(CHAVE, JSON.stringify(d)); avisar(); }

  // ------------------------------------------------------------ empresas (do cadastro)
  const ativaNoAno = (c, ano) => { for (let m = 1; m <= 12; m++) if (ativaNoMes(c, ano + "-" + String(m).padStart(2, "0"))) return true; return false; };
  /** Grupos: a matriz com as filiais (mesma raiz de CNPJ). Uma filial sem a matriz cadastrada vira o próprio grupo. */
  function gruposDoCadastro(ano) {
    const lista = (ler("painelVencimentos:v1").clientes || []).filter((c) => c && c.id && (!ano || ativaNoAno(c, ano)));
    const porRaiz = {};
    lista.forEach((c) => { const r = raizCnpj(c.documento); if (r && !ehFilial(c.documento)) porRaiz[r] = c; });
    const g = {};
    lista.forEach((c) => {
      const r = raizCnpj(c.documento);
      const matriz = ehFilial(c.documento) && porRaiz[r] ? porRaiz[r] : c;
      const x = g[matriz.id] = g[matriz.id] || { matriz, filiais: [] };
      if (matriz !== c) x.filiais.push(c);
    });
    return Object.values(g).map((x) => Object.assign(x, { filiais: x.filiais.sort((a, b) => txt(a.documento).localeCompare(txt(b.documento))) }))
      .sort((a, b) => txt(a.matriz.nome).localeCompare(txt(b.matriz.nome), "pt-BR"));
  }

  // ------------------------------------------------------------ números e status
  function salvar(empresaId, ano, campos) {
    if (!empresaId) throw new Error("Escolha a empresa.");
    if (!/^\d{4}$/.test(String(ano))) throw new Error("Ano inválido.");
    const d = dados(), a = doAno(d, String(ano));
    const u = Object.assign({}, a.unidades[empresaId] || {});
    Object.keys(campos || {}).forEach((k) => {
      if (k === "obs") { u.obs = txt(campos.obs); return; }
      if (!CAMPOS.some((c) => c[0] === k)) return;
      const v = campos[k];
      if (v !== null && v !== "" && v !== undefined && isNaN(Number(v))) throw new Error("Valor inválido em " + CAMPOS.find((c) => c[0] === k)[1] + ".");
      if ((k === "estoqueInicial" || k === "estoqueFinal" || k === "compras" || k === "receitaBruta") && Number(v) < 0) throw new Error(CAMPOS.find((c) => c[0] === k)[1] + " não pode ser negativo.");
      u[k] = num(v);
    });
    u.alteradoEm = hoje();
    a.unidades[empresaId] = u;
    gravar(d);
    return u;
  }
  /** Encerra (ou reabre) o grupo da matriz. Para encerrar, todas as unidades precisam dos números obrigatórios. */
  function encerrar(matrizId, ano, sim, quem) {
    ano = String(ano);
    const g = gruposDoCadastro(ano).find((x) => x.matriz.id === matrizId);
    if (!g) throw new Error("Empresa não encontrada no ano.");
    const d = dados(), a = doAno(d, ano);
    if (sim) {
      const falta = [g.matriz].concat(g.filiais).filter((c) => !completa(a.unidades[c.id]));
      if (falta.length) throw new Error("Faltam estoque, compras ou receita de: " + falta.map((c) => c.nome).join(", ") + ".");
      a.grupos[matrizId] = { status: "encerrado", por: txt(quem), em: hoje() };
    } else delete a.grupos[matrizId];
    gravar(d);
  }

  function somar(lista) {
    const s = {};
    CAMPOS.forEach(([k]) => { const vs = lista.map((d) => num((d || {})[k])).filter((v) => v !== null); s[k] = vs.length ? r2(vs.reduce((t, v) => t + v, 0)) : null; });
    // o resultado do período do consolidado soma o de cada unidade (informado ou sugerido)
    const rs = lista.map((d) => calcular(d).resultado).filter((v) => v !== null);
    s.resultadoPeriodo = rs.length ? r2(rs.reduce((t, v) => t + v, 0)) : null;
    return s;
  }

  /** filtro: { status: "pendente"|"encerrado", regime, busca } */
  function grupos(ano, filtro) {
    ano = String(ano || anoPadrao());
    const f = filtro || {}, b = chave(f.busca);
    const a = doAno(dados(), ano);
    const todos = gruposDoCadastro(ano).map((g) => {
      const unidades = [g.matriz].concat(g.filiais).map((c, i) => {
        const d = a.unidades[c.id] || {};
        return { empresa: c, filial: i > 0, dados: d, calc: calcular(d), completa: completa(d) };
      });
      const consolidadoDados = somar(unidades.map((u) => u.dados));
      const st = a.grupos[g.matriz.id];
      const completas = unidades.filter((u) => u.completa).length;
      return { matriz: g.matriz, unidades, consolidado: Object.assign({ dados: consolidadoDados }, { calc: calcular(consolidadoDados) }),
        status: st ? "encerrado" : "pendente", por: st ? st.por : "", em: st ? st.em : "", completas, prontaParaEncerrar: !st && completas === unidades.length };
    });
    const lista = todos.filter((g) => (!f.status || g.status === f.status)
      && (!f.regime || (f.regime === "(sem)" ? !g.matriz.regime : g.matriz.regime === f.regime))
      && (!b || g.unidades.some((u) => chave(u.empresa.nome).indexOf(b) > -1 || txt(u.empresa.documento).replace(/\D/g, "").indexOf(b.replace(/\D/g, "") || "#") > -1)));
    const encerrados = todos.filter((g) => g.status === "encerrado").length;
    return { ano, grupos: lista, total: todos.length, encerrados, pendentes: todos.length - encerrados,
      pct: todos.length ? Math.round((encerrados / todos.length) * 100) : null };
  }

  function carregarDemonstracao(ano) {
    ano = String(ano || anoPadrao());
    const d = dados();
    if (Object.keys(doAno(d, ano).unidades).length) return false;
    const gs = gruposDoCadastro(ano);
    if (!gs.length) return false;
    const a = doAno(d, ano);
    gs.forEach((g, i) => {
      [g.matriz].concat(g.filiais).forEach((c, j) => {
        if (i === gs.length - 1 && j === 0) return;   // um grupo fica sem números, para ver o pendente
        const base = 180000 * (i + 1) + j * 45000;
        const ei = r2(base * 0.22), compras = r2(base * 0.61), ef = r2(base * 0.25), receita = r2(base * 1.35);
        a.unidades[c.id] = { estoqueInicial: ei, compras, estoqueFinal: ef, receitaBruta: receita, resultadoAntesEstoque: r2(receita * 0.32 - (ef - ei)), resultadoPeriodo: null, obs: "Exemplo", alteradoEm: hoje() };
      });
      if (i === 0) a.grupos[g.matriz.id] = { status: "encerrado", por: "Exemplo", em: hoje() };
    });
    gravar(d);
    return true;
  }
  function limpar() {
    const antes = ls.getItem(CHAVE);
    gravar({ anos: {} });
    return () => { ls.setItem(CHAVE, antes || JSON.stringify({ anos: {} })); avisar(); };
  }

  return { hoje, anoPadrao, gruposDoCadastro, salvar, encerrar, grupos, carregarDemonstracao, limpar };
}
