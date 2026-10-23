/*
 * Auditor IBS/CBS: confere os itens de NF-e (mod. 55) e NFS-e no grupo IBSCBS (LC 214/2025, NT 2025.002):
 * CST, cClassTrib, base de cálculo, alíquota nominal e efetiva (com a redução do gRed) e os valores de
 * IBS-UF, IBS-Município e CBS. Mesmas regras do módulo antigo (public/modulos/auditor-ibs-cbs).
 * O XML é lido com o leitor tolerante do ISS (igual no navegador e nos testes). Testado em tests/ibsCbs.test.js.
 */
import { arvore } from "./iss/leitor.mjs";

export const TOLERANCIA = 0.03;

// ------------------------------------------------------------ XML (nomes em minúsculas, sem prefixo)
function busca(el, nome) {
  if (!el) return null;
  for (const f of el.filhos) { if (f.nome === nome) return f; const x = busca(f, nome); if (x) return x; }
  return null;
}
const texto = (el, nome) => { const n = busca(el, nome); return n ? n.texto.trim() : null; };
export function num(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(",", ".");
  if (s === "") return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
const nTexto = (el, nome) => num(texto(el, nome));
/** Todos os elementos com o nome, cada um com a lista dos ancestrais (do mais perto para o mais longe). */
function comAncestrais(el, nome, pilha = [], out = []) {
  for (const f of el.filhos) {
    if (f.nome === nome) out.push({ el: f, ancestrais: [el].concat(pilha.slice().reverse()) });
    comAncestrais(f, nome, pilha.concat([el]), out);
  }
  return out;
}
function todos(el, nome, out = []) { for (const f of el.filhos) { if (f.nome === nome) out.push(f); todos(f, nome, out); } return out; }

function numeroDoc(doc) {
  for (const t of ["nnf", "nnfse", "ndps", "numero", "numeronfse", "ndfse"]) { const v = texto(doc, t); if (v) return v; }
  return null;
}

function extrair(grp, meta) {
  const row = Object.assign({ doc: meta.doc, nfNumber: meta.nfNumber ?? null, nItem: meta.nItem, desc: meta.desc, vProd: meta.vProd ?? null,
    cProd: meta.cProd ?? null, ncm: meta.ncm ?? null, cfop: meta.cfop ?? null, qCom: meta.qCom ?? null, vUnCom: meta.vUnCom ?? null },
  { cst: null, cClassTrib: null, bc: null, pIbsUf: null, vIbsUf: null, pRedAliqUf: null, pAliqEfetUf: null,
    pIbsMun: null, vIbsMun: null, pRedAliqMun: null, pAliqEfetMun: null, vIbs: null, pCbs: null, vCbs: null, pRedAliqCbs: null, pAliqEfetCbs: null, found: !!grp });
  if (!grp) return row;
  row.cst = texto(grp, "cst");
  row.cClassTrib = texto(grp, "cclasstrib");
  row.bc = nTexto(busca(grp, "gibscbs") || grp, "vbc");
  const uf = busca(grp, "gibsuf");
  if (uf) { row.pIbsUf = nTexto(uf, "pibsuf"); row.vIbsUf = nTexto(uf, "vibsuf"); const r = busca(uf, "gred"); if (r) { row.pRedAliqUf = nTexto(r, "predaliq"); row.pAliqEfetUf = nTexto(r, "paliqefet"); } }
  const mun = busca(grp, "gibsmun");
  if (mun) { row.pIbsMun = nTexto(mun, "pibsmun"); row.vIbsMun = nTexto(mun, "vibsmun"); const r = busca(mun, "gred"); if (r) { row.pRedAliqMun = nTexto(r, "predaliq"); row.pAliqEfetMun = nTexto(r, "paliqefet"); } }
  row.vIbs = nTexto(grp, "vibs");
  const cbs = busca(grp, "gcbs");
  if (cbs) { row.pCbs = nTexto(cbs, "pcbs"); row.vCbs = nTexto(cbs, "vcbs"); const r = busca(cbs, "gred"); if (r) { row.pRedAliqCbs = nTexto(r, "predaliq"); row.pAliqEfetCbs = nTexto(r, "paliqefet"); } }
  else { row.pCbs = nTexto(grp, "pcbs"); row.vCbs = nTexto(grp, "vcbs"); }
  return row;
}

/** Lê um XML de NF-e ou NFS-e. Devolve { erro, itens }. */
export function lerXml(textoXml, nome) {
  let raiz;
  try { raiz = arvore(textoXml); } catch (e) { return { erro: "XML inválido / malformado", itens: [] }; }
  const doc = { nome: "#doc", filhos: [raiz], texto: "", attrs: {} };
  const nfNumber = numeroDoc(doc);
  const dets = todos(doc, "det");
  if (dets.length) {
    return { erro: null, itens: dets.map((det, i) => {
      const prod = busca(det, "prod"), nItem = det.attrs.nitem || i + 1;
      return extrair(busca(det, "ibscbs") || busca(det, "ub"), { doc: nome, nfNumber, nItem, desc: texto(prod, "xprod") || "Item " + nItem, cProd: texto(prod, "cprod") || "",
        ncm: texto(prod, "ncm") || "", cfop: texto(prod, "cfop") || "", qCom: nTexto(prod, "qcom"), vUnCom: nTexto(prod, "vuncom"), vProd: nTexto(prod, "vprod") });
    }) };
  }
  const grupos = comAncestrais(doc, "ibscbs").concat(comAncestrais(doc, "ub"));
  if (grupos.length) {
    return { erro: null, itens: grupos.map((g, i) => {
      let desc = null;
      for (const a of g.ancestrais.slice(0, 4)) { desc = texto(a, "xprod") || texto(a, "discriminacao") || texto(a, "xserv") || texto(a, "descricao") || texto(a, "ddescricao") || texto(a, "xdescserv"); if (desc) break; }
      return extrair(g.el, { doc: nome, nfNumber, nItem: i + 1, desc: desc || "Item " + (i + 1) });
    }) };
  }
  return { erro: "Nenhum item ou grupo IBS/CBS encontrado neste XML", itens: [] };
}

// ------------------------------------------------------------ conferência
export const brl = (n) => (n === null || n === undefined || isNaN(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const pct = (n) => (n === null || n === undefined || isNaN(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + "%");

/** { nivel: "ok"|"atencao"|"erro", msgs: [{ nivel, texto }] } */
export function conferir(row) {
  const msgs = [];
  const add = (nivel, texto) => msgs.push({ nivel, texto });
  if (!row.found) { add("erro", "Grupo IBS/CBS não encontrado neste item: verifique se o XML já contempla a NT 2025.002."); return { nivel: "erro", msgs }; }
  if (!row.cst) add("erro", "CST do IBS/CBS ausente.");
  if (!row.cClassTrib) add("atencao", "cClassTrib ausente: necessário para identificar o enquadramento exato na LC 214/2025.");
  if (row.bc === null) add("atencao", "Base de cálculo (vBC) não informada: pode ser esperado para CSTs sem incidência (ex.: 400, 830).");
  const parte = (rotulo, valor, nominal, efetiva, reducao) => {
    if (row.bc === null || valor === null) return;
    const ef = efetiva !== null ? efetiva : nominal;
    if (ef === null) return;
    const esp = row.bc * ef / 100;
    if (Math.abs(esp - valor) > TOLERANCIA) add("erro", rotulo + " divergente: esperado R$ " + brl(esp) + " (BC × " + pct(ef) + "), informado R$ " + brl(valor) + ".");
    else if (reducao !== null && reducao > 0) add("ok", rotulo + " com redução de alíquota de " + pct(reducao) + ": nominal " + pct(nominal) + ", efetiva " + pct(ef) + ".");
  };
  parte("IBS-UF", row.vIbsUf, row.pIbsUf, row.pAliqEfetUf, row.pRedAliqUf);
  parte("IBS-Município", row.vIbsMun, row.pIbsMun, row.pAliqEfetMun, row.pRedAliqMun);
  if (row.vIbsUf !== null && row.vIbsMun !== null && row.vIbs !== null) {
    const esp = row.vIbsUf + row.vIbsMun;
    if (Math.abs(esp - row.vIbs) > TOLERANCIA) add("erro", "Total do IBS (vIBS) não bate com UF + Município: esperado R$ " + brl(esp) + ", informado R$ " + brl(row.vIbs) + ".");
  }
  parte("CBS", row.vCbs, row.pCbs, row.pAliqEfetCbs, row.pRedAliqCbs);
  if (!msgs.length) add("ok", "Valores e alíquotas consistentes para os campos informados.");
  return { nivel: msgs.some((m) => m.nivel === "erro") ? "erro" : msgs.some((m) => m.nivel === "atencao") ? "atencao" : "ok", msgs };
}

/** Item digitado à mão (sem XML). c = textos do formulário. Os valores que faltarem são calculados. */
export function itemManual(c, n) {
  const bc = num(c.bc), pIbsUf = num(c.pIbsUf), pIbsMun = num(c.pIbsMun), pCbs = num(c.pCbs);
  if (!String(c.desc || "").trim()) throw new Error("Informe a descrição do item.");
  const vIbsUf = bc !== null && pIbsUf !== null ? bc * pIbsUf / 100 : null;
  const vIbsMun = bc !== null && pIbsMun !== null ? bc * pIbsMun / 100 : null;
  const vIbsCalc = vIbsUf !== null || vIbsMun !== null ? (vIbsUf || 0) + (vIbsMun || 0) : null;
  const vCbsCalc = bc !== null && pCbs !== null ? bc * pCbs / 100 : null;
  const t = (k) => String(c[k] || "").trim() || null;
  return { doc: "Inserido manualmente", nfNumber: null, nItem: n, desc: String(c.desc).trim(), cProd: t("cProd"), ncm: t("ncm"), cfop: t("cfop"),
    qCom: num(c.qCom), vUnCom: num(c.vUnCom), vProd: bc, cst: t("cst"), cClassTrib: t("cClassTrib"), bc, pIbsUf, vIbsUf, pIbsMun, vIbsMun,
    vIbs: num(c.vIbs) !== null ? num(c.vIbs) : vIbsCalc, pCbs, vCbs: num(c.vCbs) !== null ? num(c.vCbs) : vCbsCalc,
    pRedAliqUf: null, pAliqEfetUf: null, pRedAliqMun: null, pAliqEfetMun: null, pRedAliqCbs: null, pAliqEfetCbs: null, found: true };
}

/** Calculadora avulsa: BC × alíquotas, e confere os valores informados. */
export function calcular(c) {
  const bc = num(c.bc), pUf = num(c.pIbsUf), pMun = num(c.pIbsMun), pCbs = num(c.pCbs), infIbs = num(c.vIbs), infCbs = num(c.vCbs);
  const ibsUf = bc !== null && pUf !== null ? bc * pUf / 100 : null;
  const ibsMun = bc !== null && pMun !== null ? bc * pMun / 100 : null;
  const ibs = ibsUf !== null || ibsMun !== null ? (ibsUf || 0) + (ibsMun || 0) : null;
  const cbs = bc !== null && pCbs !== null ? bc * pCbs / 100 : null;
  const total = ibs !== null || cbs !== null ? (ibs || 0) + (cbs || 0) : null;
  const msgs = [];
  const conf = (rot, inf, calc) => {
    if (inf === null || calc === null) return;
    const d = Math.abs(inf - calc);
    msgs.push(d <= TOLERANCIA ? { nivel: "ok", texto: "Valor de " + rot + " informado confere com o calculado." }
      : { nivel: "erro", texto: "Valor de " + rot + " informado (R$ " + brl(inf) + ") diverge do calculado (R$ " + brl(calc) + "), diferença de R$ " + brl(d) + "." });
  };
  conf("IBS", infIbs, ibs); conf("CBS", infCbs, cbs);
  return { ibsUf, ibsMun, ibs, cbs, total, msgs };
}

/** CSV para o Excel (separador ;, vírgula decimal, BOM para os acentos). */
export function csv(rows) {
  const n = (v) => (v === null || v === undefined || v === "" ? "" : String(v).replace(".", ","));
  const q = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const cab = ["Documento", "Item", "Descrição do produto", "Código", "NCM", "CFOP", "Quantidade", "Valor Unitário", "Valor Produto", "CST IBS", "cClassTrib", "BC IBS/CBS",
    "Alíquota Nominal IBS-UF (%)", "Redução IBS-UF (%)", "Alíquota Efetiva IBS-UF (%)", "Valor IBS-UF", "Alíquota Nominal IBS-Mun (%)", "Redução IBS-Mun (%)", "Alíquota Efetiva IBS-Mun (%)", "Valor IBS-Mun",
    "Valor IBS - Total", "CST CBS", "Alíquota Nominal CBS (%)", "Redução CBS (%)", "Alíquota Efetiva CBS (%)", "Valor CBS", "Valor Total (IBS + CBS)", "Situação"];
  const linhas = [cab.join(";")];
  rows.forEach((r) => {
    const v = conferir(r);
    const tot = r.vIbs !== null || r.vCbs !== null ? (r.vIbs || 0) + (r.vCbs || 0) : null;
    linhas.push([q(r.doc), r.nItem, q(r.desc || ""), q(r.cProd || ""), q(r.ncm || ""), q(r.cfop || ""), n(r.qCom), n(r.vUnCom), n(r.vProd), q(r.cst || ""), q(r.cClassTrib || ""), n(r.bc),
      n(r.pIbsUf), n(r.pRedAliqUf), n(r.pAliqEfetUf ?? r.pIbsUf), n(r.vIbsUf), n(r.pIbsMun), n(r.pRedAliqMun), n(r.pAliqEfetMun ?? r.pIbsMun), n(r.vIbsMun), n(r.vIbs),
      q(r.cst || ""), n(r.pCbs), n(r.pRedAliqCbs), n(r.pAliqEfetCbs ?? r.pCbs), n(r.vCbs), n(tot), q(v.nivel === "ok" ? "OK" : v.nivel === "atencao" ? "Atenção" : "Erro")].join(";"));
  });
  return "﻿" + linhas.join("\r\n");
}

/** Tabela de CST do IBS/CBS (Portal da Conformidade Fácil, SVRS). */
export const CSTS = [
  ["000", "Tributação integral", "Exige tributação plena", "000001: situações tributadas integralmente pelo IBS e CBS"],
  ["010", "Tributação com alíquotas uniformes", "Alíquota uniforme nacional/setorial", "010001: operações do FGTS; 010002: serviços financeiros"],
  ["011", "Tributação com alíquotas uniformes reduzidas", "Redução de alíquota uniforme", "011002: planos de assistência à saúde; 011004: concursos e prognósticos"],
  ["200", "Alíquota reduzida", "Redução de alíquota", "200003: cesta básica (Anexo I); 200028: serviços de educação (Anexo II); 200029: saúde humana (Anexo III)"],
  ["220", "Alíquota fixa", "Alíquota fixa", "220001/220002: incorporação imobiliária em regime especial"],
  ["221", "Alíquota fixa proporcional", "Alíquota fixa proporcional", "221001: locação/cessão/arrendamento de imóvel sobre receita bruta"],
  ["222", "Redução de base de cálculo", "Redução de BC", "222001: transporte internacional de passageiros (ida e volta em conjunto)"],
  ["400", "Isenção", "Sem tributação", "400001/400002: transporte público coletivo rodoviário e metroviário"],
  ["410", "Imunidade e não incidência", "Sem tributação", "410002: transferência entre estabelecimentos do mesmo contribuinte; 410004: exportações; 410036: descontos incondicionais"],
  ["510", "Diferimento", "Diferimento", "510001: energia elétrica (importação, geração, comercialização, distribuição, transmissão)"],
  ["515", "Diferimento com redução de alíquota", "Diferimento + redução", "515001: insumos agropecuários e aquícolas (Anexo IX)"],
  ["550", "Suspensão", "Suspensão", "550001: exportação de bens materiais; 550014: Zona de Processamento de Exportação; 550020: Áreas de Livre Comércio"],
  ["620", "Tributação monofásica", "Monofásica", "620001: monofásica sobre combustíveis; 620002: com retenção sobre combustíveis"],
  ["800", "Transferência de crédito", "Transferência de crédito", "800001: fusão, cisão ou incorporação; 800002: transferência de crédito do associado/cooperativa"],
  ["810", "Ajuste de IBS na ZFM", "Crédito presumido IBS ZFM", "810001: crédito presumido sobre fornecimentos a partir da ZFM"],
  ["811", "Ajustes", "Ajuste de competência", "811001: anulação de crédito por saídas imunes/isentas; 811003: desenquadramento do Simples Nacional"],
  ["820", "Tributação em documento específico", "Sem alíquota: apuração externa", "820001: planos de saúde (art. 234); 820007: serviços financeiros"],
  ["830", "Exclusão da base de cálculo", "Sem alíquota", "830001: exclusão da BC de energia elétrica fornecida pela distribuidora à UC"]
];

// ------------------------------------------------------------ exemplo (notas fictícias, alíquotas de teste de 2026)
function xmlItem(n, prod, ib) {
  const red = (p, e) => (p ? "<gRed><pRedAliq>" + p + "</pRedAliq><pAliqEfet>" + e + "</pAliqEfet></gRed>" : "");
  return '<det nItem="' + n + '"><prod><cProd>' + prod.cod + "</cProd><xProd>" + prod.desc + "</xProd><NCM>" + prod.ncm + "</NCM><CFOP>5102</CFOP><qCom>" + prod.q + "</qCom><vUnCom>" + prod.vu +
    "</vUnCom><vProd>" + ib.bc + "</vProd></prod><imposto><IBSCBS><CST>" + ib.cst + "</CST>" + (ib.cClass ? "<cClassTrib>" + ib.cClass + "</cClassTrib>" : "") +
    "<gIBSCBS><vBC>" + ib.bc + "</vBC><gIBSUF><pIBSUF>" + ib.pUf + "</pIBSUF>" + red(ib.red, ib.efUf) + "<vIBSUF>" + ib.vUf + "</vIBSUF></gIBSUF>" +
    "<gIBSMun><pIBSMun>0.00</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>" + ib.vUf + "</vIBS><gCBS><pCBS>" + ib.pCbs + "</pCBS>" + red(ib.red, ib.efCbs) + "<vCBS>" + ib.vCbs + "</vCBS></gCBS></gIBSCBS></IBSCBS></imposto></det>";
}
export function xmlsDeExemplo() {
  const nfe = '<?xml version="1.0" encoding="UTF-8"?><nfeProc><NFe><infNFe><ide><nNF>9001</nNF></ide>' +
    xmlItem(1, { cod: "EX-01", desc: "Produto exemplo tributação normal", ncm: "84713012", q: "2.0000", vu: "500.00" }, { cst: "000", cClass: "000001", bc: "1000.00", pUf: "0.10", vUf: "1.00", pCbs: "0.90", vCbs: "9.00" }) +
    xmlItem(2, { cod: "EX-02", desc: "Produto exemplo com redução de 60%", ncm: "30049099", q: "10.0000", vu: "50.00" }, { cst: "200", cClass: "200001", bc: "500.00", pUf: "0.10", red: "60.00", efUf: "0.04", vUf: "0.20", pCbs: "0.90", efCbs: "0.36", vCbs: "1.80" }) +
    xmlItem(3, { cod: "EX-03", desc: "Produto exemplo com CBS divergente", ncm: "94036000", q: "1.0000", vu: "2000.00" }, { cst: "000", bc: "2000.00", pUf: "0.10", vUf: "2.00", pCbs: "0.90", vCbs: "20.00" }) +
    "</infNFe></NFe></nfeProc>";
  const nfse = '<?xml version="1.0" encoding="UTF-8"?><NFSe><infNFSe><nNFSe>3021</nNFSe><DPS><infDPS><serv><cServ><xDescServ>Serviço exemplo de consultoria</xDescServ></cServ></serv><IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib>' +
    "<gIBSCBS><vBC>3000.00</vBC><gIBSUF><pIBSUF>0.10</pIBSUF><vIBSUF>3.00</vIBSUF></gIBSUF><gIBSMun><pIBSMun>0.00</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>3.00</vIBS><gCBS><pCBS>0.90</pCBS><vCBS>27.00</vCBS></gCBS></gIBSCBS></IBSCBS>" +
    "</infDPS></DPS></infNFSe></NFSe>";
  return [["exemplo_nfe_ficticia.xml", nfe], ["exemplo_nfse_ficticia.xml", nfse]];
}
