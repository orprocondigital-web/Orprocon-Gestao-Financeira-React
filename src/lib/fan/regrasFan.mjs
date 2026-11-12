/*
 * Fam Metal: extratos do mês → cada linha com categoria, participante, contas e status (OK / Revisar) → TXT do
 * SCI Único. As regras são as da planilha FAM_Reconciliacao v5 (macros "AtualizarParticipantes",
 * "IdentificarTransferencias", "ValidarComprovantes" e "GerarTXTUnico"), na mesma ordem:
 *
 *   0) transferência entre contas da própria empresa (CNPJ ou nome dela no histórico)
 *   1) FGTS · 1.5) DARF, IOF e tarifa (contas fixas) · 1.6) folha em lote ("FOL PAG")
 *   2) consórcio · 3) empréstimo (contratos e palavras) · 4) cheque (número → portador)
 *   5) CNPJ na lista de fornecedores · 6) CPF → nome na lista de funcionários (folha)
 *   7) nome depois do documento → lista de fornecedores · 8) entrada = recebimento · 9) sobra = Revisar
 *
 * A mais que a v5 (para resolver sozinho o que ela deixava para revisar):
 *   - regras da pessoa ("todo histórico com ARRECADACAO ESTADUAL vai para a conta X"), antes das outras;
 *   - "FOLHA PAG" também é folha em lote (o Sicredi escreve "DEB. FOLHA PAGTO");
 *   - 7b) fornecedor pelo balancete do Único (nome abreviado ou raiz do CNPJ no nome, como na versão HTML);
 *   - a entrada de uma transferência entre contas próprias não vai para o TXT (a saída do outro banco já lança).
 *
 * O que a pessoa decide numa linha (categoria, participante, contas) fica guardado e vale por cima da regra;
 * fornecedor e funcionário escolhidos entram nas listas e valem nos próximos meses.
 * Sem tela e sem rede: testado em tests/fanMetal.test.js.
 */

export const CATEGORIAS = ["Fornecedor", "Folha", "FGTS", "Recebimento", "Consorcio", "Emprestimo", "Transferencia Bancaria", "Conciliacao Manual"];

/** Configuração inicial (os códigos da v5, "confirmados com a contabilidade"). Tudo editável na tela. */
export function configPadrao() {
  return {
    cnpjEmpresa: "04957294000103", nomeEmpresa: "FAM METAL",
    contas: { fornecedor: "148", folha: "6775", recebimento: "16", emprestimo: "8329", fgts: "6791", darf: "5", iof: "571", tarifa: "565",
      consorcioSicredi: "6293", consorcioCaixa: "7772", consorcioBB: "700" },
    bancos: [
      { id: "SICREDI", nome: "Sicredi", conta: "627", numeros: ["147524", "14752-4"], palavras: ["SICREDI"] },
      { id: "BB", nome: "Banco do Brasil", conta: "615", numeros: ["272078", "307955"], palavras: ["BRASIL", "BB"] },
      { id: "CEF", nome: "Caixa", conta: "625", numeros: ["602808", "1026645"], palavras: ["CAIXA", "CEF"] },
      { id: "DAYCOVAL", nome: "Daycoval", conta: "4088", numeros: ["7493055"], palavras: ["DAYCOVAL"] },
      { id: "SICOOB", nome: "Sicoob", conta: "643", numeros: ["1165577"], palavras: ["SICOOB"] }
    ],
    contratosEmprestimo: ["C40730840", "C40721253", "C60731942", "C40733453", "C40733458", "C60732002", "C60731887", "827903258", "827906873", "827908631"],
    fornecedores: {}, funcionarios: [], cheques: {}, origemListas: null,
    regras: [],          // [{ contem, categoria, d, c, participante }] criadas na tela
    balancete: null      // { periodo, fornecedores: [{ classif, nome, raiz }] } do último balancete lido
  };
}

const txt = (v) => (v === null || v === undefined ? "" : String(v).trim());
const digitos = (v) => txt(v).replace(/\D/g, "");
/** Maiúsculas sem acento e sem espaço repetido (como o NormalizarTexto da v5, para qualquer acento). */
export const norm = (v) => txt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
export const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100 + 0;

// ------------------------------------------------------------ documentos no histórico (como a v5)

/** Primeiro bloco de exatamente 14 dígitos (CNPJ). */
export function extrairCnpj(t) { const m = /(?:^|\D)(\d{14})(?!\d)/.exec(txt(t)); return m ? m[1] : ""; }
/** Primeiro bloco de exatamente 11 dígitos (CPF). */
export function extrairCpf(t) { const m = /(?:^|\D)(\d{11})(?!\d)/.exec(txt(t)); return m ? m[1] : ""; }
/** O nome que vem depois do documento no histórico. */
export function nomeAposDoc(t, doc) { const s = txt(t), i = doc ? s.indexOf(doc) : -1; return i < 0 ? "" : s.slice(i + doc.length).trim(); }
/** O nome depois do último " - " (BB: "PIX - ENVIADO - 01/06 17:54 NOME"), sem o "dd/mm hh:mm". */
export function nomeAposMarcador(t) {
  const s = txt(t), i = s.lastIndexOf(" - ");
  if (i < 0) return "";
  return s.slice(i + 3).trim().replace(/^\d{2}\/\d{2} \d{2}:\d{2} /, "").trim();
}

/** Nome parecido numa lista (como MatchFornecedorNome/MatchFuncionarioInterno: os 15 primeiros ou um dentro do outro). */
function acharNome(nome, lista) {
  const alvo = norm(nome);
  if (alvo.length < 3) return "";
  const n = Math.min(alvo.length, 15);
  for (const cand of lista) {
    const c = norm(cand);
    if (!c) continue;
    if (c.slice(0, n) === alvo.slice(0, n) || c.indexOf(alvo) > -1 || alvo.indexOf(c) > -1) return cand;
  }
  return "";
}

// ------------------------------------------------------------ gatilhos (os da v5)

const temFgts = (t) => t.indexOf("FGTS") > -1 || t.indexOf("FUNDO DE GARANTIA") > -1 || t.indexOf("00360305000104") > -1;
function manual(t, banco, contas) {
  if (t.indexOf("DARF") > -1) return { d: contas.darf, c: banco };
  if (t.startsWith("IOF")) return { d: contas.iof, c: banco };
  if (t.indexOf("DEB TARIFA") > -1 || (t + " ").indexOf("DEB TAR ") > -1) return { d: contas.tarifa, c: banco };
  return null;
}
const folhaLote = (t) => t.indexOf("FOL PAG") > -1 || t.indexOf("FOLHA PAG") > -1;

const IGNORA = { DE: 1, DA: 1, DO: 1, DOS: 1, DAS: 1, E: 1 };
const palavras = (s) => norm(s).replace(/[^A-Z0-9 ]/g, " ").split(" ").filter((w) => w && !IGNORA[w]);
/** Nome cortado do extrato bate com o do balancete? "DELUPO COM DE F" → "DELUPO COMERCIO DE FERRAMENTAS…" (versão HTML). */
export function nomeBate(nomeExtrato, nomeCadastro) {
  const a = palavras(nomeExtrato), b = palavras(String(nomeCadastro).replace(/^\d[\d.]*\s*-?\s*/, ""));
  if (!a.length || a.join("").length < 4) return false;
  let j = 0;
  for (let i = 0; i < a.length; i++) {
    while (j < b.length && b[j].indexOf(a[i]) !== 0) { if (i === 0) return false; j++; }
    if (j >= b.length) return false;
    j++;
  }
  return true;
}
/** Fornecedor do balancete: pela raiz do CNPJ no nome (MEI: "18.663.698 FULANO") ou pelo nome. Um só, senão "". */
function doBalancete(doc, nome, bal, comMovimento) {
  const lista = (bal && bal.fornecedores) || [];
  if (!lista.length) return null;
  const d = digitos(doc);
  if (d.length === 14) { const r = lista.filter((f) => f.raiz && f.raiz === d.slice(0, 8)); if (r.length === 1) return r[0]; }
  if (!nome) return null;
  const c = lista.filter((f) => nomeBate(nome, f.nome));
  if (c.length === 1) return c[0];
  // nome repetido no balancete (cadastro em dobro): na conferência vale o que teve débito no mês, se for um só
  const m = comMovimento ? c.filter((f) => f.debito) : [];
  return m.length === 1 ? m[0] : null;
}
function consorcio(t, cfg) {
  if (t.indexOf("CONSORCIO") < 0) return "";
  if (t.indexOf("CONVENIOS ID 01475093" + cfg.cnpjEmpresa) > -1) return cfg.contas.consorcioSicredi;
  if (t.indexOf("IBC VOLVO") > -1) return cfg.contas.consorcioCaixa;
  if (/\bBB\b/.test(t) || t.indexOf("BB ") > -1) return cfg.contas.consorcioBB;
  return "";
}
function emprestimo(t, cfg) {
  if ((cfg.contratosEmprestimo || []).some((c) => c && t.indexOf(norm(c)) > -1)) return true;
  return ["LIQUIDACAO DE PARCELA", "LIQUIDACAO CONTRATO", "LIBERACAO CREDITO", "AMORTIZACAO CONTRATO", "BB GIRO", "FINAME", "EMPRESTIMO"].some((p) => t.indexOf(p) > -1);
}
const autoTransferencia = (texto, cfg) => digitos(texto).indexOf(cfg.cnpjEmpresa) > -1 || (cfg.nomeEmpresa && norm(texto).indexOf(norm(cfg.nomeEmpresa)) > -1);

/**
 * Uma linha do extrato → { categoria, cnpj, participante, status, regra, d?, c? } (o ResolverLinha da v5).
 * linha = { texto, valor (com sinal: saída negativa), banco: { conta } }.
 */
export function classificar(linha, cfg) {
  const texto = txt(linha.texto), t = norm(texto), valor = Number(linha.valor) || 0;
  const banco = (linha.banco && linha.banco.conta) || "";
  const forn = cfg.fornecedores || {};
  const r = (categoria, extra) => Object.assign({ categoria, cnpj: "", participante: "", status: "OK" }, extra);

  if (autoTransferencia(texto, cfg)) return r("Transferencia Bancaria", { cnpj: cfg.cnpjEmpresa, participante: cfg.nomeEmpresa, regra: "própria empresa" });
  const minha = (cfg.regras || []).find((x) => x.contem && t.indexOf(norm(x.contem)) > -1);
  if (minha) {
    const d = minha.d === "banco" ? banco : minha.d, c = minha.c === "banco" ? banco : minha.c;
    return r(minha.categoria || "Conciliacao Manual", { d, c, cnpj: extrairCnpj(texto) || extrairCpf(texto), participante: minha.participante || "", regra: "regra: " + minha.contem });
  }
  if (temFgts(t)) return r("FGTS", { participante: "FGTS", regra: "FGTS" });
  const m = manual(t, banco, cfg.contas);
  if (m) return r("Conciliacao Manual", Object.assign({ regra: "DARF, IOF ou tarifa" }, m));
  if (folhaLote(t)) return r("Folha", { regra: "folha em lote" });
  const cons = consorcio(t, cfg);
  if (cons) return r("Consorcio", { regra: "consórcio", contaConsorcio: cons });
  if (emprestimo(t, cfg)) return r("Emprestimo", { regra: "empréstimo" });
  const cheque = (/ALW(\d{6})/.exec(texto) || [])[1];
  if (cheque && cfg.cheques && cfg.cheques[cheque]) return r("Folha", { participante: cfg.cheques[cheque].portador || cfg.cheques[cheque], regra: "cheque" });

  const cnpj = extrairCnpj(texto);
  if (cnpj && forn[cnpj]) return r("Fornecedor", { cnpj, participante: forn[cnpj], regra: "CNPJ na lista" });
  const cpf = extrairCpf(texto);
  if (cpf) {
    const f = acharNome(nomeAposDoc(texto, cpf), cfg.funcionarios || []);
    if (f) return r("Folha", { participante: f, regra: "funcionário" });
  }
  const nomeBusca = cnpj ? nomeAposDoc(texto, cnpj) : cpf ? nomeAposDoc(texto, cpf) : nomeAposMarcador(texto);
  if (nomeBusca) {
    const nomes = Object.keys(forn).map((k) => forn[k]);
    const achado = acharNome(nomeBusca, nomes);
    if (achado) return r("Fornecedor", { cnpj: Object.keys(forn).find((k) => forn[k] === achado) || "", participante: achado, regra: "nome na lista" });
  }
  if (valor < 0) {   // 7b) o balancete do Único conhece o fornecedor (o CNPJ do extrato vai no TXT)
    const b = doBalancete(cnpj || cpf, nomeBusca, cfg.balancete);
    if (b && (cnpj || cpf)) return r("Fornecedor", { cnpj: cnpj || cpf, participante: b.nome, regra: "balancete" });
  }
  if (valor > 0 && t.indexOf("ESTORNO") < 0) {
    return r("Recebimento", { cnpj: cnpj || (cpf ? "CPF:" + cpf : ""), participante: nomeBusca, status: nomeBusca ? "REVISAR" : "OK", regra: "entrada" });
  }
  return { categoria: "", cnpj: cnpj || (cpf ? "CPF:" + cpf : ""), participante: "", status: "REVISAR", regra: "", nomeSugerido: nomeBusca };
}

/**
 * Contas do lançamento (o ClassificarParaTXT da v5) → { d, c, ladoCnpj } ou null (não dá para lançar ainda).
 * ladoCnpj: "C" = o CNPJ do participante vai no campo de crédito do TXT, "D" = no de débito (como a v5 faz).
 */
export function contasDaLinha(l, cfg, contaDestino) {
  const banco = l.banco.conta, c = cfg.contas, saida = l.valor < 0;
  switch (l.categoria) {
    case "Fornecedor": return { d: c.fornecedor, c: banco, ladoCnpj: "C" };
    case "Folha": return { d: c.folha, c: banco, ladoCnpj: "C" };
    case "FGTS": return { d: c.fgts, c: banco, ladoCnpj: "" };
    case "Recebimento": return { d: banco, c: c.recebimento, ladoCnpj: "D" };
    case "Consorcio": { const k = l.contaConsorcio || ""; return k ? (saida ? { d: k, c: banco, ladoCnpj: "" } : { d: banco, c: k, ladoCnpj: "" }) : null; }
    case "Emprestimo": return saida ? { d: c.emprestimo, c: banco, ladoCnpj: "" } : { d: banco, c: c.emprestimo, ladoCnpj: "" };
    case "Transferencia Bancaria": return contaDestino ? { d: contaDestino, c: banco, ladoCnpj: "" } : null;
    case "Conciliacao Manual": return l.d && l.c ? { d: l.d, c: l.c, ladoCnpj: "" } : null;
    default: return null;
  }
}

// ------------------------------------------------------------ extratos e linhas do mês

/** Qual banco é este extrato (pelo número da conta ou pelo nome do arquivo)? id ou "". */
export function bancoDoExtrato(numeroConta, nomeArquivo, cfg) {
  const d = digitos(numeroConta);
  for (const b of cfg.bancos) if (d && b.numeros.some((n) => digitos(n) && d.indexOf(digitos(n)) > -1)) return b.id;
  const a = norm(nomeArquivo);
  for (const b of cfg.bancos) if (b.palavras.some((p) => new RegExp("(^|[^A-Z])" + p + "([^A-Z]|$)").test(a))) return b.id;
  return "";
}

/** Texto da linha para as regras: histórico + nome + detalhes (a planilha da Caixa traz CNPJ e nome no fim). */
export function textoDaLinha(it) {
  const partes = [txt(it.desc)];
  if (it.nome && partes[0].indexOf(it.nome) < 0) partes.push(txt(it.nome));
  (it.detalhes || []).forEach((x) => { if (txt(x) && partes.join(" ").indexOf(txt(x)) < 0) partes.push(txt(x)); });
  if (it.texto) {   // planilha: o que vem depois dos valores (CNPJ e nome da outra parte)
    const resto = txt(it.texto).replace(/^.*\d,\d{2}\s+-?[\d.]+,\d{2}\s*/, "");
    if (resto && resto !== txt(it.texto) && partes.join(" ").indexOf(resto) < 0) partes.push(resto);
  }
  return partes.filter(Boolean).join(" ");
}

/** Itens lidos (lerArquivoExtrato) → linhas do banco: { chave, banco, data, valor (com sinal), texto, documento }. */
export function linhasDoExtrato(itens, bancoId) {
  const vistos = {};
  return (itens || []).filter((it) => Number(it.valorNum)).map((it) => {
    const valor = centavos((it.sign === "D" ? -1 : 1) * Math.abs(Number(it.valorNum)));
    const base = bancoId + "|" + it.data + "|" + valor.toFixed(2) + "|" + norm(it.desc).slice(0, 40);
    vistos[base] = (vistos[base] || 0) + 1;
    return { chave: base + "|" + vistos[base], bancoId, data: it.data, valor, texto: textoDaLinha(it), documento: txt(it.doc) };
  });
}

/** Comprovante (texto do PDF + nome do arquivo) → { data, valor, cnpj, nome, arquivo } ou null. */
export function lerComprovante(texto, arquivo) {
  const s = txt(texto);
  const pega = (rx) => { const m = rx.exec(s); return m ? m[1].trim() : ""; };
  const valorBR = (v) => (v ? Number(v.replace(/\./g, "").replace(",", ".")) : 0);
  let data = pega(/Data d[oa] (?:Pagamento|Transa[çc][ãa]o|Transfer[êe]ncia)[^\d]*(\d{2}\/\d{2}\/\d{4})/i) || pega(/(\d{2}\/\d{2}\/\d{4})/);
  let valor = valorBR(pega(/Valor (?:Pago|Total|da Transfer[êe]ncia|do Pix|Transferido)?\s*(?:\(R\$\))?:?\s*(?:R\$\s*)?([\d.]+,\d{2})/i));
  const cnpj = digitos(pega(/CPF\/CNPJ do (?:Benefici[áa]rio|Recebedor|Favorecido|Destinat[áa]rio):?\s*([\d./-]+)/i) || pega(/(?:CNPJ|CPF)(?: do (?:Benefici[áa]rio|Recebedor|Favorecido))?:?\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i));
  let nome = pega(/Raz[ãa]o Social do Benefici[áa]rio:?\s*(.+)/i) || pega(/Nome do (?:Recebedor|Favorecido|Benefici[áa]rio|Destinat[áa]rio):?\s*(.+)/i);
  // o nome do arquivo segue o padrão "DD-MM-AAAA - NOME - PAGO BANCO - 1.234,56.pdf": completa o que faltou
  const a = /^(\d{2})-(\d{2})-(\d{4})\s*-\s*(.+?)\s*-\s*PAGO\b.*?-\s*([\d.]+,\d{2})\s*\.pdf$/i.exec(txt(arquivo));
  if (a) {
    if (!data) data = a[1] + "/" + a[2] + "/" + a[3];
    if (!valor) valor = valorBR(a[5]);
    if (!nome) nome = a[4];
  }
  if (!data || !valor) return null;
  const [dd, mm, aa] = data.split("/");
  return { data: aa + "-" + mm + "-" + dd, valor: centavos(valor), cnpj: cnpj.length === 14 || cnpj.length === 11 ? cnpj : "", nome: nome.replace(/\s{2,}.*$/, ""), arquivo: txt(arquivo) };
}

/**
 * O mês inteiro: linhas de todos os bancos com a regra, as decisões da pessoa por cima, as transferências casadas
 * entre bancos e os comprovantes. Devolve { linhas, resumo }.
 * linha = { chave, bancoId, banco, data, valor, texto, documento, categoria, cnpj, participante, status, regra,
 *           contaDestino, comprovante, d, c, ladoCnpj, manual, motivo }.
 */
export function montarMes(extratos, cfg, decisoes = {}, comprovantes = []) {
  const bancos = Object.fromEntries(cfg.bancos.map((b) => [b.id, b]));
  const todas = [];
  (extratos || []).forEach((e) => (e.linhas || []).forEach((l) => todas.push(Object.assign({}, l, { banco: bancos[l.bancoId] || { id: l.bancoId, conta: "" } }))));

  // índice para as transferências: data|valor absoluto → bancos que têm o movimento
  const porValor = {};
  todas.forEach((l) => { const k = l.data + "|" + Math.abs(l.valor).toFixed(2); (porValor[k] = porValor[k] || []).push(l); });
  // comprovantes por data|valor (um comprovante vale para uma linha só)
  const compPorChave = {};
  (comprovantes || []).forEach((c) => { const k = c.data + "|" + c.valor.toFixed(2); (compPorChave[k] = compPorChave[k] || []).push(c); });

  const linhas = todas.map((l) => {
    const auto = classificar({ texto: l.texto, valor: l.valor, banco: l.banco }, cfg);
    const dec = decisoes[l.chave];
    const x = Object.assign({}, l, auto, { manual: false, motivo: "" });
    const comps = compPorChave[l.data + "|" + Math.abs(l.valor).toFixed(2)];
    if (comps && comps.length && l.valor < 0) {
      x.comprovante = comps.shift();
      // como o ResolverViaComprovantes: linha sem participante ganha o fornecedor do comprovante
      if (!x.participante && x.comprovante) {
        const cc = x.comprovante.cnpj, forn = cfg.fornecedores || {};
        if (cc && forn[cc]) Object.assign(x, { categoria: "Fornecedor", cnpj: cc, participante: forn[cc], status: "OK", regra: "comprovante" });
        else if (cc || x.comprovante.nome) { x.cnpj = cc || x.cnpj; x.nomeSugerido = x.comprovante.nome || x.nomeSugerido; }
      }
    }
    if (dec) {
      Object.assign(x, dec, { manual: true });
      if (!dec.status) x.status = dec.categoria ? "OK" : "REVISAR";
    }
    if (x.categoria === "Transferencia Bancaria") {
      if (x.bancoDestino) x.contaDestino = (bancos[x.bancoDestino] || {}).conta || "";
      else {
        const par = (porValor[l.data + "|" + Math.abs(l.valor).toFixed(2)] || []).find((o) => o.bancoId !== l.bancoId && Math.sign(o.valor) === -Math.sign(l.valor));
        if (par) { x.bancoDestino = par.bancoId; x.contaDestino = par.banco.conta; }
      }
      // a entrada de uma transferência já é lançada pela saída do outro banco (senão o TXT teria o dobro)
      if (l.valor > 0 && x.bancoDestino) { x.status = "OK"; x.soNoOutroBanco = true; }
      else x.status = x.contaDestino ? (dec && dec.status ? dec.status : "OK") : "REVISAR";
    }
    const k = x.status === "OK" && !x.soNoOutroBanco ? contasDaLinha(x, cfg, x.contaDestino) : null;
    if (k) Object.assign(x, { d: k.d, c: k.c, ladoCnpj: k.ladoCnpj });
    else if (x.status === "OK" && !x.soNoOutroBanco) { x.status = "REVISAR"; x.motivo = x.categoria ? "falta conta" : "sem categoria"; }
    if (x.status === "REVISAR" && !x.motivo) x.motivo = !x.categoria ? "sem categoria" : x.categoria === "Recebimento" ? "conferir o cliente" : "conferir";
    return x;
  });

  const resumo = { total: linhas.length, ok: 0, revisar: 0, porBanco: {}, porCategoria: {} };
  linhas.forEach((l) => {
    if (l.status === "OK") resumo.ok++; else resumo.revisar++;
    const b = resumo.porBanco[l.bancoId] = resumo.porBanco[l.bancoId] || { total: 0, ok: 0 };
    b.total++; if (l.status === "OK") b.ok++;
    const c = l.categoria || "(sem categoria)";
    const g = resumo.porCategoria[c] = resumo.porCategoria[c] || { n: 0, valor: 0 };
    g.n++; g.valor = centavos(g.valor + Math.abs(l.valor));
  });
  resumo.pct = resumo.total ? Math.round(resumo.ok / resumo.total * 1000) / 10 : 0;
  return { linhas, resumo };
}

/** O complemento do TXT (MontarComplemento da v5): sem vírgula nem quebra de linha, até 200 caracteres. */
export function complemento(t) { return txt(t).replace(/,/g, ";").replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").slice(0, 200); }

/** Número do documento (como a v5): o do extrato se for número; senão o número antes de " - " no histórico; senão 0. */
function numeroDoc(documento, comp) {
  const truncar = (s) => txt(s).split(".")[0];
  let d = truncar(documento);
  if (!/^\d+$/.test(d)) { const i = comp.indexOf(" - "); d = i > 0 && /^\d+$/.test(comp.slice(0, i).trim()) ? comp.slice(0, i).trim() : ""; }
  return d || "0";
}

/** Linhas OK → TXT do Único no layout da v5 (GerarTXTUnico). Devolve { texto, exportadas, ignoradas }. */
export function txtUnicoFan(linhas) {
  const saida = [];
  let ignoradas = 0;
  linhas.forEach((l) => {
    if (l.status !== "OK" || l.soNoOutroBanco) return;
    if (!l.d || !l.c) { ignoradas++; return; }
    const comp = complemento(l.texto);
    const cnpj = digitos(l.cnpj);
    const seq = String(saida.length + 1).padStart(6, "0");
    saida.push([seq, l.data.replace(/-/g, ""), l.d, l.c, Math.abs(l.valor).toFixed(2), "", comp, "DCTO" + numeroDoc(l.documento, comp),
      l.categoria + "_" + l.bancoId, l.ladoCnpj === "D" ? cnpj : "", l.ladoCnpj === "C" ? cnpj : "", "", "", "", "", "A"].join(","));
  });
  return { texto: saida.join("\r\n") + (saida.length ? "\r\n" : ""), exportadas: saida.length, ignoradas };
}

/**
 * Balancete Consolidado de fornecedores do Único em PDF (texto do textoDoPdf) → { ok, erro, periodo, fornecedores }.
 * fornecedor = { conta, classif, nome, raiz, saldoAnterior, debito, credito, saldoAtual }. Nome comprido quebra a linha
 * e os valores vão para a linha de baixo: junta até achar os quatro valores.
 */
export function lerBalancetePdf(texto) {
  const L = String(texto || "").split(/\r?\n/);
  const MON = /\(?-?\d{1,3}(?:\.\d{3})*,\d{2}\)?/g;
  const ini = /^\s*(\d+)\s+(\d{2}\.\d\.\d\.\d{2}\.\d{6,})\s+(.*)$/;
  const valor = (s) => (s.startsWith("(") ? -1 : 1) * Number(s.replace(/[()]/g, "").replace(/\./g, "").replace(",", "."));
  let periodo = null;
  const pm = /de (\d{2})\/(\d{2})\/(\d{4}) a (\d{2})\/(\d{2})\/(\d{4})/.exec(texto || "");
  if (pm) periodo = { inicio: pm[3] + "-" + pm[2] + "-" + pm[1], fim: pm[6] + "-" + pm[5] + "-" + pm[4] };
  const fornecedores = [];
  for (let i = 0; i < L.length; i++) {
    const m = ini.exec(L[i]);
    if (!m) continue;
    let resto = m[3], j = i + 1;
    while ((resto.match(MON) || []).length < 4 && j < L.length && j < i + 3 && !ini.test(L[j])) { resto += " " + L[j].trim(); j++; }
    const vals = resto.match(MON) || [];
    if (vals.length < 4) continue;
    const ult = vals.slice(-4);
    let nome = resto;
    ult.forEach((v) => { nome = nome.replace(v, " "); });
    nome = nome.replace(/\s+/g, " ").trim();
    const raiz = (/^(\d{2})\.(\d{3})\.(\d{3})\b/.exec(nome) || []).slice(1).join("");
    fornecedores.push({ conta: m[1], classif: m[2], nome, raiz, saldoAnterior: valor(ult[0]), debito: valor(ult[1]), credito: valor(ult[2]), saldoAtual: valor(ult[3]) });
    i = j - 1;
  }
  return { ok: fornecedores.length > 0, erro: fornecedores.length ? "" : "Não reconheci o balancete de fornecedores (linhas \"148 02.1.1.01…\" com os quatro valores).", periodo, fornecedores };
}

/**
 * Listas da planilha v5 (abas de lerPlanilha) → { fornecedores: {cnpj: nome}, funcionarios: [nome], cheques: {n: {portador, cnpj}} }.
 * Abas _FORNECEDORES (CNPJ, NOME), _FUNCIONARIOS (NOME) e _CHEQUES (NUMERO, PORTADOR, CNPJ).
 */
export function listasDaV5(abas) {
  const aba = (n) => (abas || []).find((a) => norm(a.nome) === n);
  const fornecedores = {}, funcionarios = [], cheques = {};
  const fa = aba("_FORNECEDORES"), fu = aba("_FUNCIONARIOS"), ch = aba("_CHEQUES");
  // o Excel tira o zero da frente quando o CNPJ vira número: 13 dígitos = CNPJ, 10 = CPF
  if (fa) fa.rows.slice(1).forEach((r) => { const c = digitos(r[0]); if (c.length >= 9 && c.length <= 14 && txt(r[1])) fornecedores[c.padStart(c.length > 11 ? 14 : 11, "0")] = txt(r[1]); });
  if (fu) fu.rows.slice(1).forEach((r) => { if (txt(r[0])) funcionarios.push(txt(r[0])); });
  if (ch) ch.rows.slice(1).forEach((r) => { const n = digitos(r[0]); if (n) cheques[n.padStart(6, "0")] = { portador: txt(r[1]), cnpj: digitos(r[2]) }; });
  return { ok: !!(fa || fu), fornecedores, funcionarios, cheques };
}

/**
 * Conferência com o balancete do Único: os pagamentos a fornecedor do mês (saídas com categoria Fornecedor) somados
 * por fornecedor do balancete × o débito dele no período. Acha o fornecedor pela raiz do CNPJ ou pelo nome.
 * → { linhas: [{ fornecedor, pagos, totalBanco, debito, diferenca, status }], semFornecedor: [linha], resumo }.
 * status: bate | diferenca | so_banco | so_balancete.
 */
export function conferirBalancete(linhas, balancete) {
  const lista = (balancete && balancete.fornecedores) || [];
  const porClassif = {}, semFornecedor = [];
  (linhas || []).filter((l) => l.categoria === "Fornecedor" && l.valor < 0).forEach((l) => {
    // pelo nome da lista ou pelo nome que o próprio extrato traz depois do documento
    const doc = extrairCnpj(l.texto) || extrairCpf(l.texto);
    const doExtrato = doc ? nomeAposDoc(l.texto, doc) : nomeAposMarcador(l.texto);
    const f = doBalancete(l.cnpj, l.participante || l.nomeSugerido, balancete, true) || doBalancete(doc, doExtrato, balancete, true)
      || (l.participante ? lista.find((x) => norm(x.nome) === norm(l.participante)) : null);
    if (!f) { semFornecedor.push(l); return; }
    (porClassif[f.classif] = porClassif[f.classif] || []).push(l);
  });
  const out = [];
  lista.forEach((f) => {
    const pagos = porClassif[f.classif] || [];
    const totalBanco = centavos(pagos.reduce((t, l) => t + Math.abs(l.valor), 0));
    const debito = centavos(f.debito);
    if (!totalBanco && !debito) return;
    const status = !totalBanco ? "so_balancete" : !debito ? "so_banco" : Math.abs(totalBanco - debito) < 0.005 ? "bate" : "diferenca";
    out.push({ fornecedor: f, pagos, totalBanco, debito, diferenca: centavos(totalBanco - debito), status });
  });
  const resumo = { bate: 0, diferenca: 0, so_banco: 0, so_balancete: 0, semFornecedor: semFornecedor.length };
  out.forEach((l) => { resumo[l.status]++; });
  resumo.semFornecedorValor = centavos(semFornecedor.reduce((t, l) => t + Math.abs(l.valor), 0));
  return { linhas: out, semFornecedor, resumo };
}

/** A pessoa decidiu uma linha: o fornecedor ou o funcionário entra na lista (vale nos próximos meses). */
export function aprender(cfg, decisao) {
  const novo = Object.assign({}, cfg);
  const cnpj = digitos(decisao.cnpj);
  if (decisao.categoria === "Fornecedor" && cnpj.length === 14 && decisao.participante && !(cfg.fornecedores || {})[cnpj]) {
    novo.fornecedores = Object.assign({}, cfg.fornecedores, { [cnpj]: decisao.participante });
  }
  if (decisao.categoria === "Folha" && decisao.participante && !(cfg.funcionarios || []).some((f) => norm(f) === norm(decisao.participante))) {
    novo.funcionarios = (cfg.funcionarios || []).concat(decisao.participante);
  }
  return novo;
}

// ------------------------------------------------------------ o mês salvo (servidor: /api/conciliacoes, tipo "fan")

/** Mês vazio: os extratos de cada banco, os comprovantes, o que a pessoa decidiu e o balancete do mês. */
export function mesVazio(competencia) {
  return { competencia: txt(competencia), extratos: [], comprovantes: [], decisoes: {}, balancete: null };
}

/** Mês salvo → mês completo (o que faltar vem vazio). */
export function mesDoEstado(e, competencia) {
  const v = mesVazio((e && e.competencia) || competencia);
  if (!e || typeof e !== "object") return v;
  return Object.assign(v, {
    extratos: Array.isArray(e.extratos) ? e.extratos : [], comprovantes: Array.isArray(e.comprovantes) ? e.comprovantes : [],
    decisoes: e.decisoes && typeof e.decisoes === "object" ? e.decisoes : {}, balancete: e.balancete || null
  });
}

/** Nome do mês: "Fam Metal – 09/2026". */
export const nomeDoMes = (competencia) => "Fam Metal – " + (competencia ? competencia.slice(5) + "/" + competencia.slice(0, 4) : "sem mês");

/** O pedido para o servidor: o resumo vai nas colunas da lista (OK, a revisar, decididas à mão). */
export function pedidoDoMes(mes, cfg, resumo) {
  const r = resumo || { ok: 0, revisar: 0 };
  return { nome: nomeDoMes(mes.competencia), empresaCnpj: digitos(cfg.cnpjEmpresa), empresaNome: "Fam Metal", competencia: mes.competencia || "", tipo: "fan",
    ok: r.ok || 0, soExtrato: r.revisar || 0, soPlanilha: 0, conferidos: Object.keys(mes.decisoes || {}).length, estado: JSON.stringify(mes) };
}

/** Uma regra nova a partir de uma linha: o começo fixo do histórico, até o primeiro número (sempre um pedaço dele). */
export function trechoParaRegra(texto) {
  const t = norm(texto), i = t.search(/\d/);
  return (i < 0 ? t : t.slice(0, i)).split(" ").slice(0, 4).join(" ").replace(/[^A-Z0-9]+$/, "").trim();
}
