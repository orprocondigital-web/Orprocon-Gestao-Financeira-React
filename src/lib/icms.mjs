/*
 * Apuração parcial de ICMS (prévia durante o mês; a oficial continua no Único).
 *
 * A partir dos XMLs de NF-e/NFC-e de uma empresa: separa entrada e saída, agrupa por CFOP, soma débitos
 * (saídas) e créditos (entradas) e mostra o saldo até a data escolhida. Mesmas regras do módulo antigo
 * (public/modulos/apuracao-icms):
 *  - emitida pela empresa: tpNF 1 = saída (débito), 0 = entrada (crédito); emitida por fornecedor para a
 *    empresa = entrada, com o CFOP convertido para o de entrada (5→1, 6→2, 7→3; 540x→1403, 640x→2403);
 *  - ICMS do item (vICMS); na entrada sem vICMS, o crédito do Simples (vCredICMSSN); ST e DIFAL ficam fora;
 *  - cada CFOP entra ou não na conta; por padrão não entram 1551/1556/1403… (entradas) e 5929/6929 (saídas);
 *  - nota cancelada (evento 110111 carregado ou cStat 101) sai da conta;
 *  - saldo = (débitos + outros débitos) − (créditos + outros créditos + saldo credor anterior).
 * O XML é lido com o leitor tolerante do ISS (funciona igual no navegador e nos testes).
 * Testado em tests/icms.test.js.
 */
import { arvore } from "./iss/leitor.mjs";

const r2 = (v) => Math.round((v || 0) * 100) / 100;

// ------------------------------------------------------------ XML
const filhos = (el, nome) => (el ? el.filhos.filter((f) => f.nome === nome) : []);
const filho = (el, nome) => filhos(el, nome)[0] || null;
function busca(el, nome) {   // primeiro descendente com o nome
  if (!el) return null;
  for (const f of el.filhos) { if (f.nome === nome) return f; const x = busca(f, nome); if (x) return x; }
  return null;
}
function buscaTodos(el, nome, out = []) {
  if (!el) return out;
  for (const f of el.filhos) { if (f.nome === nome) out.push(f); else buscaTodos(f, nome, out); }
  return out;
}
const tx = (el, nome) => { const n = busca(el, nome); return n ? n.texto.trim() : ""; };
const txFilho = (el, nome) => { const n = filho(el, nome); return n ? n.texto.trim() : ""; };
const num = (el, nome) => { const v = parseFloat(tx(el, nome)); return isNaN(v) ? 0 : v; };

/** Lê um XML: { tipo: "nfe", nota } | { tipo: "cancelamento", chaves } | { tipo: "resumo" | "invalido" | "outro" }. */
export function lerXml(texto) {
  let raiz;
  try { raiz = arvore(texto); } catch (e) { return { tipo: "invalido" }; }
  const doc = { nome: "#doc", filhos: [raiz], texto: "" };
  const inf = busca(doc, "infnfe");
  if (!inf) {
    const evs = buscaTodos(doc, "infevento");
    if (evs.length) {
      const chaves = evs.filter((ev) => tx(ev, "tpevento") === "110111").map((ev) => tx(ev, "chnfe")).filter(Boolean);
      return chaves.length ? { tipo: "cancelamento", chaves } : { tipo: "outro" };
    }
    return busca(doc, "resnfe") ? { tipo: "resumo" } : { tipo: "outro" };
  }
  const ide = filho(inf, "ide"), emit = filho(inf, "emit"), dest = filho(inf, "dest"), tot = busca(inf, "icmstot"), prot = busca(doc, "infprot");
  const chave = (inf.attrs.id || "").replace(/^NFe/i, "") || tx(prot, "chnfe");
  const dh = tx(ide, "dhemi") || tx(ide, "demi");
  const itens = filhos(inf, "det").map((det) => {
    const prod = filho(det, "prod"), imp = filho(det, "imposto");
    const grupo = filho(imp, "icms");
    const icms = grupo && grupo.filhos[0] ? grupo.filhos[0] : null;
    const vST = icms ? num(icms, "vicmsst") : 0;
    const vIPI = num(busca(imp, "ipitrib"), "vipi");
    return {
      cfop: tx(prod, "cfop"), descricao: tx(prod, "xprod"),
      vc: r2(num(prod, "vprod") + num(prod, "vfrete") + num(prod, "vseg") + num(prod, "voutro") - num(prod, "vdesc") + vIPI + vST),
      cst: icms ? (txFilho(icms, "cst") ? txFilho(icms, "orig") + txFilho(icms, "cst") : txFilho(icms, "csosn")) : "",
      bc: icms ? num(icms, "vbc") : 0, aliq: icms ? num(icms, "picms") : 0,
      icms: icms ? num(icms, "vicms") : 0, credSN: icms ? num(icms, "vcredicmssn") : 0
    };
  });
  if (!chave) return { tipo: "invalido" };
  return { tipo: "nfe", nota: {
    chave, mod: tx(ide, "mod"), serie: tx(ide, "serie"), numero: tx(ide, "nnf"), data: dh.slice(0, 10), tpNF: tx(ide, "tpnf"), natOp: tx(ide, "natop"),
    emit: { doc: txFilho(emit, "cnpj") || txFilho(emit, "cpf"), nome: txFilho(emit, "xnome"), crt: txFilho(emit, "crt") },
    dest: { doc: txFilho(dest, "cnpj") || txFilho(dest, "cpf"), nome: txFilho(dest, "xnome") },
    vNF: num(tot, "vnf"), cStat: tx(prot, "cstat"), itens
  } };
}

// ------------------------------------------------------------ regras de CFOP
const EXCL_E = new Set(["1551", "2551", "3551", "1556", "2556", "3556", "1403", "2403", "1405", "2405", "1406", "2406", "1407", "2407", "1653", "2653"]);
const EXCL_S = new Set(["5929", "6929"]);
const EQUIV = { 5401: "1403", 5402: "1403", 5403: "1403", 5405: "1403", 6401: "2403", 6402: "2403", 6403: "2403", 6404: "2403" };
export function cfopEntrada(c) {
  if (EQUIV[c]) return EQUIV[c];
  const d = { 5: "1", 6: "2", 7: "3" }[c[0]];
  return d ? d + c.slice(1) : c;
}
export const regraPadrao = (dir, cfop) => (dir === "S" ? !EXCL_S.has(cfop) : !EXCL_E.has(cfop));
export const regraDe = (regras, dir, cfop) => { const k = dir + ":" + cfop; return regras && k in regras ? !!regras[k] : regraPadrao(dir, cfop); };

/** CNPJs que aparecem nas notas (emitente ou destinatário), do que mais aparece para o que menos aparece. */
export function empresasDasNotas(notas) {
  const m = new Map();
  const add = (doc, nome) => { if (!doc || doc.length !== 14) return; const c = m.get(doc) || { doc, nome, n: 0 }; c.n++; if (!c.nome && nome) c.nome = nome; m.set(doc, c); };
  notas.forEach((n) => { add(n.emit.doc, n.emit.nome); add(n.dest.doc, n.dest.nome); });
  return [...m.values()].sort((a, b) => b.n - a.n);
}
/** Entrada ou saída para a empresa apurada; null se a nota não é dela. */
export function classificar(n, empresa) {
  if (!empresa) return null;
  if (n.emit.doc === empresa) return { dir: n.tpNF === "0" ? "E" : "S", terceiros: false };
  if (n.dest.doc === empresa) return { dir: n.tpNF === "1" ? "E" : "S", terceiros: true };
  return null;
}
const cfopDoItem = (it, c) => (c.dir === "E" && c.terceiros ? cfopEntrada(it.cfop) : it.cfop);
const icmsDoItem = (it, c) => (c.dir === "E" ? (it.icms > 0 ? it.icms : it.credSN) : it.icms);

/** Período padrão: do dia 1º do mês da última nota até a última nota desse mês. */
export function periodoPadrao(notas, empresa) {
  const datas = notas.filter((n) => classificar(n, empresa)).map((n) => n.data).filter(Boolean).sort();
  if (!datas.length) return { de: "", ate: "" };
  const mes = datas[datas.length - 1].slice(0, 7);
  return { de: mes + "-01", ate: datas.filter((d) => d.startsWith(mes)).pop() };
}

/**
 * A apuração. p = { notas, canceladas: Set|array de chaves, empresa, de, ate, regras, ajustes: {saldoAnt, outCred, outDeb} }
 */
export function apurar(p) {
  const canc = p.canceladas instanceof Set ? p.canceladas : new Set(p.canceladas || []);
  const aj = Object.assign({ saldoAnt: 0, outCred: 0, outDeb: 0 }, p.ajustes || {});
  const porCfop = new Map(), lista = [], diario = new Map();
  let deb = 0, cred = 0, nS = 0, nE = 0, nX = 0, fora = 0;
  for (const n of p.notas) {
    const c = classificar(n, p.empresa);
    if (!c) { fora++; continue; }
    if (p.de && n.data < p.de) continue;
    if (p.ate && n.data > p.ate) continue;
    const cancelada = canc.has(n.chave) || n.cStat === "101";
    let apur = 0; const cfops = new Set();
    for (const it of n.itens) {
      const cf = cfopDoItem(it, c); cfops.add(cf);
      if (cancelada) continue;
      const k = c.dir + ":" + cf;
      let g = porCfop.get(k);
      if (!g) { g = { dir: c.dir, cfop: cf, origens: new Set(), notas: new Set(), vc: 0, bc: 0, icms: 0, credSN: 0 }; porCfop.set(k, g); }
      if (c.terceiros && c.dir === "E") g.origens.add(it.cfop);
      g.notas.add(n.chave); g.vc += it.vc; g.bc += it.bc;
      const v = icmsDoItem(it, c); g.icms += v;
      if (c.dir === "E" && !(it.icms > 0) && it.credSN > 0) g.credSN += it.credSN;
      if (regraDe(p.regras, c.dir, cf)) apur += v;
    }
    if (cancelada) nX++;
    else {
      if (c.dir === "S") { deb += apur; nS++; } else { cred += apur; nE++; }
      const d = diario.get(n.data) || { deb: 0, cred: 0 };
      if (c.dir === "S") d.deb += apur; else d.cred += apur;
      diario.set(n.data, d);
    }
    lista.push({ nota: n, dir: c.dir, terceiros: c.terceiros, cancelada, apur: r2(apur), cfops: [...cfops] });
  }
  deb = r2(deb); cred = r2(cred);
  const grupos = [...porCfop.values()].map((g) => Object.assign(g, { vc: r2(g.vc), bc: r2(g.bc), icms: r2(g.icms), credSN: r2(g.credSN), entra: regraDe(p.regras, g.dir, g.cfop) }))
    .sort((a, b) => (a.dir === b.dir ? 0 : a.dir === "S" ? -1 : 1) || a.cfop.localeCompare(b.cfop));
  const debTot = r2(deb + aj.outDeb), credTot = r2(cred + aj.outCred + aj.saldoAnt);
  return { grupos, notas: lista.sort((a, b) => a.nota.data.localeCompare(b.nota.data) || (+a.nota.numero) - (+b.nota.numero)),
    diario, deb, cred, debTot, credTot, saldo: r2(debTot - credTot), ajustes: aj, nS, nE, nX, fora };
}

/** Débitos e créditos acumulados dia a dia no período (para o gráfico). */
export function acumulado(diario, de, ate) {
  if (!de || !ate || ate < de) return [];
  const dias = [];
  const d = new Date(de + "T12:00:00Z"), fim = new Date(ate + "T12:00:00Z");
  while (d <= fim && dias.length < 400) { dias.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  let cd = 0, cc = 0;
  return dias.map((dia) => { const v = diario.get(dia); if (v) { cd += v.deb; cc += v.cred; } return { dia, deb: r2(cd), cred: r2(cc) }; });
}

// ------------------------------------------------------------ exemplo (empresa, clientes e fornecedores fictícios)
export function xmlsDeExemplo(mes = "2026-09") {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const [ano, mm] = mes.split("-").map(Number);
  const EMP = { doc: "11222333000181", nome: "Comercial Exemplo Ltda", uf: "SC", crt: "3" };
  const CLI = [{ doc: "44555666000177", nome: "Mercado Exemplo Ltda", uf: "SC" }, { doc: "48111222000190", nome: "Distribuidora Exemplo Ltda", uf: "SC" }, { doc: "77888999000155", nome: "Atacado Exemplo S.A.", uf: "PR" }];
  const FOR = { sc: { doc: "22333444000110", nome: "Indústria Exemplo S.A.", uf: "SC", crt: "3" }, sp: { doc: "33444555000120", nome: "Embalagens Exemplo Ltda", uf: "SP", crt: "3" },
    sn: { doc: "55666777000130", nome: "Fábrica Exemplo ME", uf: "SC", crt: "1" }, st: { doc: "66777888000140", nome: "Bebidas Exemplo S.A.", uf: "SC", crt: "3" }, uc: { doc: "39888777000160", nome: "Papelaria Exemplo Ltda", uf: "SC", crt: "3" } };
  let nSaida = 1000, nEnt = 500; const out = [];
  const chave = (emit, mod, n) => "42" + String(ano).slice(2) + String(mm).padStart(2, "0") + emit.doc + mod + "001" + String(n).padStart(9, "0") + "1" + String(Math.floor(rnd() * 1e8)).padStart(8, "0") + "0";
  function nfe({ emit, dest, tpNF, mod = "55", n, dia, natOp, itens }) {
    const ch = chave(emit, mod, n);
    const dh = mes + "-" + String(dia).padStart(2, "0") + "T" + String(8 + Math.floor(rnd() * 9)).padStart(2, "0") + ":15:00-03:00";
    let tBC = 0, tICMS = 0, tProd = 0;
    const dets = itens.map((it, i) => {
      tProd += it.v; let icms;
      if (it.csosn) { const cr = r2(it.v * it.pCredSN / 100); icms = "<ICMSSN101><orig>0</orig><CSOSN>101</CSOSN><pCredSN>" + it.pCredSN.toFixed(2) + "</pCredSN><vCredICMSSN>" + cr.toFixed(2) + "</vCredICMSSN></ICMSSN101>"; }
      else if (it.st) icms = "<ICMS60><orig>0</orig><CST>60</CST></ICMS60>";
      else { const v = r2(it.v * it.aliq / 100); tBC += it.v; tICMS += v; icms = "<ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>" + it.v.toFixed(2) + "</vBC><pICMS>" + it.aliq.toFixed(2) + "</pICMS><vICMS>" + v.toFixed(2) + "</vICMS></ICMS00>"; }
      return '<det nItem="' + (i + 1) + '"><prod><cProd>' + (i + 1) + "</cProd><xProd>" + it.x + "</xProd><CFOP>" + it.cfop + "</CFOP><qCom>1</qCom><vProd>" + it.v.toFixed(2) + "</vProd></prod><imposto><ICMS>" + icms + "</ICMS></imposto></det>";
    }).join("");
    const destXml = dest ? "<dest><CNPJ>" + dest.doc + "</CNPJ><xNome>" + dest.nome + "</xNome></dest>" : "";
    out.push('<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe' + ch + '" versao="4.00"><ide><cUF>42</cUF><natOp>' + natOp + "</natOp><mod>" + mod +
      "</mod><serie>1</serie><nNF>" + n + "</nNF><dhEmi>" + dh + "</dhEmi><tpNF>" + tpNF + "</tpNF></ide><emit><CNPJ>" + emit.doc + "</CNPJ><xNome>" + emit.nome + "</xNome><enderEmit><UF>" + emit.uf + "</UF></enderEmit><CRT>" + (emit.crt || "3") +
      "</CRT></emit>" + destXml + dets + "<total><ICMSTot><vBC>" + tBC.toFixed(2) + "</vBC><vICMS>" + tICMS.toFixed(2) + "</vICMS><vProd>" + tProd.toFixed(2) + "</vProd><vNF>" + tProd.toFixed(2) +
      "</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><chNFe>" + ch + "</chNFe><cStat>100</cStat></infProt></protNFe></nfeProc>");
    return ch;
  }
  const val = (a, b) => r2(a + rnd() * (b - a));
  let cancelar = null;
  for (let dia = 1; dia <= 28; dia++) {
    const dow = new Date(Date.UTC(ano, mm - 1, dia)).getUTCDay(); if (dow === 0) continue;
    const nv = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < nv; k++) {
      const c = pick(CLI), inter = c.uf !== "SC";
      const ch = nfe({ emit: EMP, dest: c, tpNF: "1", n: nSaida++, dia, natOp: "Venda de mercadoria", itens: [
        { x: "Arroz tipo 1 5kg", cfop: inter ? "6102" : "5102", v: val(800, 4200), aliq: inter ? 12 : 17 },
        { x: "Refrigerante 2L", cfop: inter ? "6403" : "5405", v: val(200, 900), st: true }] });
      if (dia === 9 && k === 0) cancelar = ch;
    }
    if (dow !== 6) nfe({ emit: EMP, dest: null, tpNF: "1", mod: "65", n: nSaida++, dia, natOp: "Venda ao consumidor", itens: [{ x: "Vendas do dia", cfop: "5102", v: val(600, 1800), aliq: 17 }] });
    if (dia % 3 === 1) nfe({ emit: FOR.sc, dest: EMP, tpNF: "1", n: nEnt++, dia, natOp: "Venda", itens: [{ x: "Arroz tipo 1 5kg (fardo)", cfop: "5102", v: val(3000, 9000), aliq: 17 }] });
    if (dia % 5 === 2) nfe({ emit: FOR.sp, dest: EMP, tpNF: "1", n: nEnt++, dia, natOp: "Venda", itens: [{ x: "Caixas de papelão", cfop: "6102", v: val(1500, 4000), aliq: 12 }] });
    if (dia % 7 === 3) nfe({ emit: FOR.sn, dest: EMP, tpNF: "1", n: nEnt++, dia, natOp: "Venda", itens: [{ x: "Biscoito artesanal", cfop: "5101", v: val(700, 2000), csosn: "101", pCredSN: 2.56 }] });
    if (dia % 6 === 4) nfe({ emit: FOR.st, dest: EMP, tpNF: "1", n: nEnt++, dia, natOp: "Venda com ST", itens: [{ x: "Refrigerante 2L (fardo)", cfop: "5405", v: val(1200, 3000), st: true }] });
  }
  nfe({ emit: FOR.uc, dest: EMP, tpNF: "1", n: nEnt++, dia: 10, natOp: "Venda", itens: [{ x: "Material de escritório", cfop: "5102", v: 640, aliq: 17 }] });
  nfe({ emit: EMP, dest: CLI[0], tpNF: "1", n: nSaida++, dia: 15, natOp: "Devolução de compra", itens: [{ x: "Arroz tipo 1 5kg (avariado)", cfop: "5202", v: 480, aliq: 17 }] });
  nfe({ emit: EMP, dest: CLI[1], tpNF: "0", n: nSaida++, dia: 18, natOp: "Devolução de venda", itens: [{ x: "Arroz tipo 1 5kg", cfop: "1202", v: 920, aliq: 17 }] });
  nfe({ emit: EMP, dest: CLI[0], tpNF: "1", n: nSaida++, dia: 21, natOp: "Lançamento de operação em cupom", itens: [{ x: "Vendas do cupom fiscal", cfop: "5929", v: 1150, aliq: 17 }] });
  if (cancelar) out.push('<?xml version="1.0" encoding="UTF-8"?><procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><evento><infEvento><chNFe>' + cancelar + "</chNFe><tpEvento>110111</tpEvento><detEvento><descEvento>Cancelamento</descEvento></detEvento></infEvento></evento></procEventoNFe>");
  return out;
}

/** Valor digitado ("1.234,56", "1234.56", "R$ 10") → número. */
export function lerValor(s) {
  s = String(s || "").trim(); if (!s) return 0;
  s = s.replace(/[R$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const v = parseFloat(s); return isNaN(v) ? 0 : v;
}
