/*
 * Integração contábil: contas bancárias, unidades, outras movimentações, cadastros e competência (mês).
 *
 * As mesmas regras e as mesmas chaves de dados da versão HTML (js/app.js), então os dois sistemas
 * enxergam os mesmos dados no navegador. Aqui não tem tela: as páginas React chamam estas funções,
 * e os testes (tests/contabil.test.js) também. As regras de cálculo continuam em src/legado/
 * (Integracao, Importacao, Extratos) e chegam por parâmetro.
 *
 * Onde fica cada coisa:
 *   localStorage  system_banks, system_units, system_mov_contas, competencia
 *   Store (IndexedDB)  lancamentos:<AAAA-MM>:<id>, cadastro:<id>, cabecalho:<id>
 */

export const MOVIMENTOS = [
  { id: "mov-dinheiro", label: "Pagamentos em dinheiro", bank: "Movimento", sheetName: "Pagamento em dinheiro", entraNaIntegracao: true },
  { id: "mov-juros", label: "Juros recebidos", bank: "Movimento", sheetName: "Juros Recebidos" },
  { id: "mov-compras", label: "Digitação de compras", bank: "Movimento", sheetName: "Digitação Compras (Nova-teste)" }
];

// colunas: usadas quando o cadastro começa do zero, sem planilha. A ordem importa: a integração lê a natureza
// e a conta (Plano de contas), o Caixa e a conta (Tabela de bancos) e o CNPJ e o código SCI da unidade
// (Tabela de unidades) pela posição, igual às abas da planilha.
export const CADASTROS = [
  { id: "cad-clientes", label: "Clientes", sheetName: "Clientes", colunas: ["Nome", "CPF/CNPJ"] },
  { id: "cad-fornecedores", label: "Fornecedores", sheetName: "Fornecedores", colunas: ["Nome", "CPF/CNPJ"] },
  { id: "cad-plano", label: "Plano de contas", sheetName: "Plano de Contas", colunas: ["Natureza", "Conta contábil"] },
  { id: "cad-custos", label: "Centro de custos", sheetName: "Centro de Custos", colunas: ["Unidade", "Centro de custo"] },
  { id: "cad-bancos", label: "Tabela de bancos", sheetName: "Tabela de Bancos", colunas: ["Banco", "Descrição", "Conta contábil"] },
  { id: "cad-unidades", label: "Tabela de unidades", sheetName: "Tabela de Unidades", colunas: ["Unidade", "CNPJ", "Código SCI"] }
];

export const BANCOS = ["Sicoob", "Sicredi", "Caixa Econômica", "Banco do Brasil", "Itaú", "Bradesco", "Santander", "Banrisul", "Nubank", "Inter", "Outro"];
export const DEFAULT_UNIDADES = ["Matriz", "Tubarão", "Chapecó", "Criciúma", "Florianópolis", "Passo Fundo"];
export const MAX_CAMPOS_CADASTRO = 12;

/** Nome comparável: sem acento, sem maiúscula, espaços simples ("Chapecó " = "chapeco"). */
export function chaveNome(s) {
  return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}
export function mesDe(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
export function nomeDaFonte(item) {
  if (!item) return "";
  return item.bank === "Movimento" ? item.sheetName : (item.sheetName || ((item.bank ? item.bank + " " : "") + item.label));
}
function n(x) { return Number(x).toLocaleString("pt-BR"); }

/**
 * deps: { Store, ls (localStorage), Core, Integracao, Importacao, Extratos, agora?, aoMudar? }
 * aoMudar() é chamado depois de cada gravação (as telas usam para se redesenhar).
 */
export function criarContabil(deps) {
  const { Store, ls, Integracao: I, Importacao, Extratos } = deps;
  const agora = deps.agora || (() => new Date());
  const avisar = () => { if (deps.aoMudar) deps.aoMudar(); };
  let seq = 0;
  const novoId = (p) => p + agora().getTime().toString(36) + (seq++).toString(36);

  // ------------------------------------------------------------ listas pequenas (localStorage)
  function lerLista(k, padrao) { try { return JSON.parse(ls.getItem(k)) || padrao; } catch (e) { return padrao; } }
  function gravarLista(k, v) { try { ls.setItem(k, JSON.stringify(v)); } catch (e) { /* sem espaço: segue na memória */ } avisar(); }

  function bancos() {
    // contas criadas antes da conta contábil existir: tira do nome da aba
    return lerLista("system_banks", []).map((b) => (b.contaContabil === undefined
      ? Object.assign({}, b, { contaContabil: I.contaDoNome(b.sheetName || "") || I.contaDoNome(b.label || "") }) : b));
  }
  function unidades() { return lerLista("system_units", []); }
  function contasMov() { return lerLista("system_mov_contas", {}); }
  function movimentos() {
    const c = contasMov();
    return MOVIMENTOS.map((m) => (m.entraNaIntegracao ? Object.assign({}, m, { contaContabil: c[m.id] || "" }) : m));
  }

  /** Qualquer coisa do menu da integração pelo id, com tipo: banco, unidade, mov ou cadastro. */
  function item(id) {
    const b = bancos().find((x) => x.id === id);
    if (b) return Object.assign({ tipo: "banco" }, b);
    const u = unidades().find((x) => x.id === id);
    if (u) return Object.assign({ tipo: "unidade" }, u);
    const m = movimentos().find((x) => x.id === id);
    if (m) return Object.assign({ tipo: "mov" }, m);
    const c = CADASTROS.find((x) => x.id === id);
    if (c) return Object.assign({ tipo: "cadastro" }, c);
    return null;
  }

  // ------------------------------------------------------------ competência (mês)
  function competencia() { return ls.getItem("competencia") || mesDe(agora()); }
  function definirCompetencia(mes) {
    if (!/^\d{4}-\d{2}$/.test(mes)) return false;
    ls.setItem("competencia", mes); avisar(); return true;
  }
  function competenciasComDados() {
    const meses = {};
    Store.keys().forEach((k) => {
      const m = /^lancamentos:(\d{4}-\d{2}):/.exec(k);
      if (m && (Store.get(k) || []).length) meses[m[1]] = true;
    });
    return meses;
  }
  /** Meses para escolher: os que têm dados, o atual, o anterior e o escolhido. Mais novo primeiro. */
  function listaCompetencias() {
    const comDados = competenciasComDados();
    const meses = Object.assign({}, comDados);
    const hoje = agora();
    meses[competencia()] = true;
    meses[mesDe(hoje)] = true;
    meses[mesDe(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1))] = true;
    return Object.keys(meses).sort().reverse().map((m) => ({ mes: m, nome: Importacao.nomeCompetencia(m), vazio: !comDados[m] }));
  }

  // ------------------------------------------------------------ lançamentos e cadastros (Store)
  const chaveLanc = (id, mes) => "lancamentos:" + (mes || competencia()) + ":" + id;
  function lancamentos(id, mes) { return Store.get(chaveLanc(id, mes)) || []; }
  function gravar(k, v) {
    const p = Store.set(k, v);
    avisar();
    return p;
  }
  function salvarLancamentos(id, lista, mes) { return gravar(chaveLanc(id, mes), lista); }
  function cadastro(id) { return Store.get("cadastro:" + id) || []; }
  function salvarCadastro(id, lista) { return gravar("cadastro:" + id, lista); }
  function cabecalho(id) { return Store.get("cabecalho:" + id) || []; }

  /** Versões até 0.4 guardavam tudo em "lancamentos:agosto:*", sem mês. Move para a competência certa, uma vez. */
  function migrarParaCompetencias() {
    const antigas = Store.keys().filter((k) => k.indexOf("lancamentos:agosto:") === 0);
    if (!antigas.length) return Promise.resolve(null);
    let datas = [];
    antigas.forEach((k) => {
      const id = k.slice("lancamentos:agosto:".length);
      if (id.indexOf("cad-") !== 0 && id.indexOf("unid-") !== 0) datas = datas.concat(Store.get(k) || []);
    });
    const mes = Importacao.competenciaDominante(datas) || mesDe(agora());
    return Promise.all(antigas.map((k) => {
      const id = k.slice("lancamentos:agosto:".length);
      const nova = id.indexOf("cad-") === 0 ? "cadastro:" + id : "lancamentos:" + mes + ":" + id;
      const valor = Store.get(k);
      return (Store.get(nova) ? Promise.resolve() : Store.set(nova, valor)).then(() => Store.remove(k));
    })).then(() => { if (!ls.getItem("competencia")) ls.setItem("competencia", mes); avisar(); return mes; });
  }

  // ------------------------------------------------------------ contas bancárias e conta contábil
  /** dados: { banco, agencia, numero, contabil }. Devolve a conta criada; erro com mensagem se faltar algo. */
  function criarConta(dados) {
    const banco = String(dados.banco || "").trim().toUpperCase();
    const cc = String(dados.numero || "").trim().toUpperCase();
    const contabil = String(dados.contabil || "").trim();
    if (!banco) throw new Error("Escolha o banco.");
    if (!cc || !contabil) throw new Error("Preencha o número da conta e a conta contábil no Único.");
    if (!/^\d+$/.test(contabil)) throw new Error("A conta contábil deve ter só números (ex.: 643).");
    const lista = lerLista("system_banks", []);
    const repetida = lista.find((b) => b.contaContabil === contabil);
    if (repetida) throw new Error("A conta contábil " + contabil + " já é da conta " + nomeDaFonte(repetida) + ".");
    // mesmo padrão dos nomes de aba da planilha: "SICOOB 24402-3 Conta 643"
    const nova = { id: novoId("banco-"), type: "ledger", bank: banco, label: cc + " Conta " + contabil,
      sheetName: banco + " " + cc + " Conta " + contabil, agencia: String(dados.agencia || "").trim(), conta: cc,
      contaContabil: contabil, hasDataMov: true };
    gravarLista("system_banks", lista.concat(nova));
    return nova;
  }
  function excluirConta(id) {
    const lista = lerLista("system_banks", []);
    const conta = lista.find((b) => b.id === id);
    if (!conta) return null;
    Store.keys().filter((k) => /^lancamentos:\d{4}-\d{2}:/.test(k) && k.endsWith(":" + id)).forEach((k) => Store.remove(k));
    gravarLista("system_banks", lista.filter((b) => b.id !== id));
    return conta;
  }
  function definirContaContabil(id, valor) {
    const v = String(valor || "").trim();
    if (!/^\d+$/.test(v)) throw new Error("Use só números.");
    const mov = MOVIMENTOS.find((m) => m.id === id);
    if (mov) {
      if (!mov.entraNaIntegracao) throw new Error("Este movimento não entra na integração.");
      gravarLista("system_mov_contas", Object.assign(contasMov(), { [id]: v }));
      return;
    }
    const lista = bancos();
    const conta = lista.find((b) => b.id === id);
    if (!conta) throw new Error("Conta não encontrada.");
    conta.contaContabil = v;
    gravarLista("system_banks", lista);
  }

  // ------------------------------------------------------------ lançamentos de uma conta
  /**
   * Novo lançamento (editandoId vazio) ou edição. dados vêm do formulário; o valor já em número.
   * Devolve o lançamento gravado; erro com mensagem se faltar data, descrição ou valor.
   */
  function salvarLancamento(id, dados, editandoId) {
    const it = item(id);
    if (!dados.data || !String(dados.desc || "").trim() || !isFinite(dados.valorNum) || dados.valorNum === 0) {
      throw new Error("Preencha data, descrição e valor.");
    }
    const limpo = {
      data: dados.data, dataMov: it && it.hasDataMov ? (dados.dataMov || "") : "",
      desc: String(dados.desc).trim(), doc: String(dados.doc || "").trim(), modelo: dados.modelo || "",
      valorNum: Math.abs(dados.valorNum), sign: dados.sign === "D" ? "D" : "C",
      categoria: dados.categoria || "", unidade: dados.unidade || "",
      natureza: String(dados.natureza || "").trim(), conta: String(dados.conta || "").trim(),
      nome: String(dados.nome || "").trim(), cpf: String(dados.cpf || "").trim()
    };
    let lista = lancamentos(id), salvo;
    if (editandoId) {
      // quem editou conferiu: o valor foi redigitado e a sugestão deixa de ser sugestão
      lista = lista.map((x) => (x.id === editandoId ? (salvo = Object.assign({}, x, limpo, { valorInvalido: false, valorOriginal: "", sugerido: false })) : x));
      if (!salvo) throw new Error("Lançamento não encontrado (talvez já tenha sido excluído).");
    } else {
      salvo = Object.assign({ id: novoId("e") }, limpo);
      lista = lista.concat(salvo);
    }
    salvarLancamentos(id, lista);
    return salvo;
  }
  /** Exclui e devolve uma função que desfaz (põe de volta no mesmo lugar). */
  function excluirLancamento(id, lancId) {
    const mes = competencia();
    const lista = lancamentos(id, mes);
    const pos = lista.findIndex((x) => x.id === lancId);
    if (pos < 0) return null;
    const removido = lista[pos];
    salvarLancamentos(id, lista.filter((x) => x.id !== lancId), mes);
    return () => {
      const atual = lancamentos(id, mes);
      if (atual.some((x) => x.id === lancId)) return;
      const nova = atual.slice(); nova.splice(Math.min(pos, nova.length), 0, removido);
      salvarLancamentos(id, nova, mes);
    };
  }
  function confirmarSugestoes(id) {
    let qtd = 0;
    const lista = lancamentos(id).map((e) => { if (!e.sugerido) return e; qtd++; const c = Object.assign({}, e); delete c.sugerido; return c; });
    if (qtd) salvarLancamentos(id, lista);
    return qtd;
  }
  function apagarDoMes(id) {
    const qtd = lancamentos(id).length;
    if (qtd) salvarLancamentos(id, []);
    return qtd;
  }
  /** Conta contábil a partir da natureza, pelo Plano de contas (vazio se não achar). */
  function contaDaNatureza(natureza) {
    const nat = chaveNome(natureza);
    if (!nat) return "";
    const p = cadastro("cad-plano").find((x) => chaveNome(x.nome) === nat);
    return p && p.linha && p.linha[1] !== undefined && p.linha[1] !== "" ? String(p.linha[1]) : "";
  }
  /** Opções do formulário de lançamento. */
  function opcoesFormulario(limiteNomes = 5000) {
    const vistos = {}, nomes = [];
    cadastro("cad-fornecedores").concat(cadastro("cad-clientes")).some((e) => {
      if (e.nome && !vistos[e.nome]) { vistos[e.nome] = true; nomes.push(e.nome); }
      return nomes.length >= limiteNomes;
    });
    return {
      categorias: I.CATEGORIAS, modelos: I.MODELOS_DOC, unidades: nomesUnidades(),
      naturezas: cadastro("cad-plano").map((e) => ({ nome: e.nome, conta: e.linha && e.linha[1] ? String(e.linha[1]) : "" })),
      nomes: nomes.sort((a, b) => a.localeCompare(b, "pt-BR"))
    };
  }
  function totais(lista) {
    let cred = 0, deb = 0, pend = 0, sug = 0;
    lista.forEach((e) => {
      if (e.sign === "D") deb += e.valorNum || 0; else cred += e.valorNum || 0;
      if (!e.categoria) pend++;
      if (e.sugerido) sug++;
    });
    return { qtd: lista.length, creditos: cred, debitos: deb, saldo: cred - deb, pendentes: pend, sugeridos: sug };
  }

  // ------------------------------------------------------------ cadastros
  function colunasDoCadastro(id) {
    let cab = cabecalho(id).map((c) => String(c === undefined || c === null ? "" : c).trim());
    let ultima = cab.length; while (ultima > 0 && !cab[ultima - 1]) ultima--;
    cab = cab.slice(0, ultima);
    const def = CADASTROS.find((c) => c.id === id);
    return cab.length ? cab.slice(0, MAX_CAMPOS_CADASTRO) : ((def && def.colunas) || ["Nome"]).slice();
  }
  /** valores: textos na ordem das colunas. Devolve o item; erro com mensagem se faltar o nome ou repetir. */
  function salvarItemCadastro(id, valores, editandoId) {
    const cols = colunasDoCadastro(id);
    const lista = cadastro(id);
    const atual = editandoId ? lista.find((x) => x.id === editandoId) : null;
    const linha = atual && atual.linha ? atual.linha.slice() : [];   // colunas fora do formulário ficam como estavam
    valores.forEach((v, i) => { linha[i] = String(v === undefined || v === null ? "" : v).trim(); });
    for (let k = 0; k < linha.length; k++) if (linha[k] === undefined) linha[k] = "";
    // o nome sai igual ao da importação da planilha (coluna "Nome"/"Descrição" ou o primeiro texto)
    const lido = Importacao.cadastroDaAba([cols, linha], "x").itens[0];
    const nome = lido ? lido.nome : "";
    if (!nome) throw new Error("Preencha o campo " + (cols[0] || "Nome") + ".");
    const repetido = lista.find((x) => x.id !== editandoId && chaveNome(x.nome) === chaveNome(nome));
    if (repetido) throw new Error("Já existe \"" + repetido.nome + "\" neste cadastro.");
    let salvo;
    const nova = atual
      ? lista.map((x) => (x.id === editandoId ? (salvo = Object.assign({}, x, { nome, linha })) : x))
      : lista.concat(salvo = { id: id + "-m" + novoId(""), nome, linha });
    if (!cabecalho(id).length) Store.set("cabecalho:" + id, cols);
    salvarCadastro(id, nova);
    return salvo;
  }
  function excluirItemCadastro(id, itemId) {
    const lista = cadastro(id);
    const pos = lista.findIndex((x) => x.id === itemId);
    if (pos < 0) return null;
    const removido = lista[pos];
    salvarCadastro(id, lista.filter((x) => x.id !== itemId));
    return () => {
      const atual = cadastro(id);
      if (atual.some((x) => x.id === itemId)) return;
      const nova = atual.slice(); nova.splice(Math.min(pos, nova.length), 0, removido);
      salvarCadastro(id, nova);
    };
  }
  function apagarCadastro(id) { const q = cadastro(id).length; if (q) salvarCadastro(id, []); return q; }

  // ------------------------------------------------------------ importar uma aba (conta ou cadastro)
  /**
   * abas: [{ nome, rows }] do arquivo escolhido. Acha a aba da conta/cadastro e lê, sem gravar.
   * Conta: { aba, itens, porMes, meses, jaTem, semData }. Cadastro: { aba, itens, cabecalho, jaTem }.
   */
  function lerAba(id, abas) {
    const it = item(id);
    const nomes = abas.map((a) => a.nome);
    const aba = it.tipo === "cadastro"
      ? (abas.find((a) => chaveNome(a.nome) === chaveNome(it.sheetName)) || (abas.length === 1 ? abas[0] : null))
      : abas.find((a) => a.nome === findSheet(nomes, it));
    if (!aba) return { erro: "Não encontrei a aba \"" + (it.tipo === "cadastro" ? it.sheetName : nomeDaFonte(it)) + "\" neste arquivo. Abas disponíveis: " + nomes.join(", ") };
    if (it.tipo === "cadastro") {
      const r = Importacao.cadastroDaAba(aba.rows, "c" + agora().getTime().toString(36));
      if (!r.itens.length) return { erro: "Nenhum dado reconhecido na aba \"" + aba.nome + "\"." };
      return { aba: aba.nome, itens: r.itens, cabecalho: r.cabecalho, jaTem: cadastro(id).length };
    }
    const r = Importacao.lancamentosDaAba(aba.rows, { comDataMov: !!it.hasDataMov, prefixoId: novoId("e") });
    if (!r.ok) return { erro: "A aba \"" + aba.nome + "\" não tem as colunas Data e Valor." };
    if (!r.itens.length) return { erro: "Nenhum lançamento reconhecido na aba \"" + aba.nome + "\"." };
    const porMes = {};
    r.itens.forEach((e) => { const m = String(e.data).slice(0, 7); (porMes[m] = porMes[m] || []).push(e); });
    const meses = Object.keys(porMes).sort();
    let jaTem = 0;
    meses.forEach((m) => { jaTem += lancamentos(id, m).length; });
    return { aba: aba.nome, itens: r.itens, porMes, meses, jaTem, semData: r.semData };
  }
  function findSheet(nomes, it) { return deps.Core.findSheet(nomes, { sheetName: nomeDaFonte(it), label: it.label, conta: it.conta }); }

  /** Grava o que lerAba achou. somar = juntar aos existentes; senão substitui. Devolve a mensagem. */
  function gravarAba(id, lido, somar) {
    const it = item(id);
    if (it.tipo === "cadastro") {
      let lista = somar ? cadastro(id).concat(lido.itens) : lido.itens;
      const vistos = {};
      lista = lista.filter((c) => { const k = String(c.nome); if (vistos[k]) return false; vistos[k] = true; return true; });
      Store.set("cabecalho:" + id, lido.cabecalho);
      salvarCadastro(id, lista);
      return n(lido.itens.length) + " item(ns) importado(s) da aba \"" + lido.aba + "\".";
    }
    lido.meses.forEach((m) => { salvarLancamentos(id, (somar ? lancamentos(id, m) : []).concat(lido.porMes[m]), m); });
    const principal = lido.meses.slice().sort((a, b) => lido.porMes[b].length - lido.porMes[a].length)[0];
    const trocou = principal && principal !== competencia();
    if (trocou) definirCompetencia(principal);
    let msg = n(lido.itens.length) + " lançamento(s) importado(s) da aba \"" + lido.aba + "\", em " +
      lido.meses.map(Importacao.nomeCompetencia).join(", ") + "." + (trocou ? " A competência mudou para " + Importacao.nomeCompetencia(principal) + "." : "");
    if (lido.semData) msg += " " + lido.semData + " linha(s) classificadas ficaram de fora por não terem data. A planilha também não as envia ao Único.";
    return msg;
  }

  // ------------------------------------------------------------ unidades e Master
  function tabelaUnidades() { return cadastro("cad-unidades").filter((e) => e.linha && String(e.linha[0]).trim()); }
  function nomesUnidades() {
    const t = tabelaUnidades().map((e) => String(e.linha[0]).trim());
    if (t.length) return t;
    const u = unidades();
    return u.length ? u.map((x) => x.label) : DEFAULT_UNIDADES.slice();
  }
  function idUnidade(nome) {
    const achou = unidades().find((u) => chaveNome(u.label) === chaveNome(nome));
    return achou ? achou.id : null;
  }
  function fontesIntegracao() {
    const fontes = bancos().map((b) => ({ id: b.id, nome: nomeDaFonte(b), contaBanco: b.contaContabil || "", lancamentos: lancamentos(b.id) }));
    movimentos().filter((m) => m.entraNaIntegracao).forEach((m) => {
      // sem conta definida, usa a conta do Caixa da Tabela de bancos (padrão 5)
      fontes.push({ id: m.id, nome: m.sheetName, contaBanco: m.contaContabil || I.contaCaixa(cadastro("cad-bancos")), lancamentos: lancamentos(m.id) });
    });
    return fontes;
  }
  /** Números do painel: totais, por unidade e por conta. */
  function painel() {
    const fontes = fontesIntegracao();
    const st = I.estatisticasMaster(fontes, nomesUnidades());
    let total = 0, classificados = 0, sugeridos = 0;
    st.bancos.forEach((b) => { total += b.total; classificados += b.classificados; });
    fontes.forEach((f) => f.lancamentos.forEach((e) => { if (e.sugerido) sugeridos++; }));
    const lista = bancos().concat(movimentos());
    return {
      mes: competencia(), nomeMes: Importacao.nomeCompetencia(competencia()), total, classificados, sugeridos,
      pendentes: total - classificados, pct: total ? Math.round(classificados / total * 100) : 0,
      unidades: st.unidades.map((u) => Object.assign({ id: idUnidade(u.nome) }, u)),
      bancos: st.bancos.map((b) => {
        const it = lista.find((x) => x.id === b.id);
        const semConta = !!it && (it.bank !== "Movimento" || it.entraNaIntegracao) && !it.contaContabil && b.total > 0;
        return Object.assign({ semConta }, b);
      })
    };
  }

  /** Monta as abas de unidade a partir dos lançamentos classificados. null se não há nada classificado. */
  function distribuir() {
    const tx = I.coletarTransacoes(fontesIntegracao());
    if (!tx.length) return null;
    const dist = I.distribuirPorUnidade(tx);
    let lista = unidades(), criadas = 0, mudou = false;
    // unidades digitadas duas vezes com grafias diferentes ("chapeco" e "Chapecó") viram uma só
    const vistas = {};
    lista = lista.filter((u) => {
      const k = chaveNome(u.label);
      if (vistas[k]) { Store.keys().filter((x) => x.endsWith(":" + u.id)).forEach((x) => Store.remove(x)); mudou = true; return false; }
      vistas[k] = true; return true;
    });
    dist.forEach((d) => {
      let u = lista.find((x) => chaveNome(x.label) === chaveNome(d.unidade));
      if (u && u.label !== d.unidade) { u.label = d.unidade; u.sheetName = d.unidade; mudou = true; }
      if (!u) {
        u = { id: novoId("unid-"), label: d.unidade, type: "ledger", bank: "Unidade", sheetName: d.unidade, hasDataMov: false };
        lista.push(u); criadas++; mudou = true;
      }
      Store.set(chaveLanc(u.id), d.linhas.map((l, i) => Object.assign({ id: u.id + "-" + i }, l)));
    });
    // unidades sem lançamento nesta rodada ficam vazias (igual à planilha)
    lista.forEach((u) => { if (!dist.some((d) => chaveNome(d.unidade) === chaveNome(u.label))) Store.set(chaveLanc(u.id), []); });
    if (mudou) gravarLista("system_units", lista); else avisar();
    let semConta = 0;
    dist.forEach((d) => { semConta += I.semConta(d.linhas).length; });
    let msg = n(tx.length) + " lançamentos distribuídos para " + dist.length + " unidade(s), ordenados por Despesa, Pagamento e Recebimento.";
    if (semConta) msg += " Atenção: " + semConta + " com pendência (sem conta de débito/crédito ou valor fora do padrão).";
    return { dist, semConta, criadas, total: tx.length, msg };
  }

  /** Antes de gerar: o que pode impedir ou pedir confirmação. */
  function preverTxts() {
    const r = distribuir();
    if (!r) return { erro: "Nenhum lançamento classificado para gerar TXT. Preencha categoria e unidade nas contas bancárias." };
    if (!tabelaUnidades().length) return { erro: "Falta a Tabela de unidades: abra Cadastros › Tabela de unidades e importe a planilha (ou cadastre à mão). Ela traz o CNPJ e o código SCI de cada unidade, que vão no TXT." };
    let sugeridos = 0;
    fontesIntegracao().forEach((f) => f.lancamentos.forEach((e) => { if (e.sugerido) sugeridos++; }));
    return { sugeridos, semConta: r.semConta };
  }
  /** formato "atual" ou "unico". Devolve { arquivos, msg } ou { erro }. */
  function gerarTxts(formato) {
    const r = distribuir();
    if (!r) return { erro: "Nenhum lançamento classificado para gerar TXT." };
    const tabela = tabelaUnidades();
    if (!tabela.length) return { erro: "Falta a Tabela de unidades." };
    const opcoes = { ignorarSemConta: true };
    const arquivos = formato === "unico"
      ? I.gerarTxtsUnico(r.dist, tabela, cadastro("cad-custos"), opcoes)
      : I.gerarTxts(r.dist, tabela, opcoes);
    if (!arquivos.length) return { erro: "Nenhuma unidade da Tabela de unidades tem lançamentos completos." };
    if (r.semConta) arquivos.push({ nome: "PENDENCIAS_" + (formato === "unico" ? "UNICO" : "TXT") + ".csv", conteudo: I.pendenciasCSV(r.dist, nomesUnidades()) });
    const foraDaTabela = r.dist.filter((d) => !I.infoUnidade(tabela, d.unidade)).map((d) => d.unidade);
    const destino = formato === "unico"
      ? arquivos.filter((a) => /^UNICO_/.test(a.nome)).map((a) => {
          const uni = r.dist.find((d) => a.nome === "UNICO_" + d.unidade.split(" ").join("_") + ".txt");
          const info = uni && I.infoUnidade(tabela, uni.unidade);
          return a.nome + " → empresa " + (info ? info.codigo : "?");
        }).join("; ")
      : arquivos.map((a) => a.nome).join(", ");
    let msg = "Arquivos gerados: " + destino + ".";
    if (formato === "unico") msg += " Importe cada arquivo no Único com a empresa indicada.";
    if (r.semConta) msg += " " + r.semConta + " lançamento(s) ficaram de fora: veja o arquivo de pendências.";
    if (foraDaTabela.length) msg += " Sem arquivo por não estarem na Tabela de unidades: " + foraDaTabela.join(", ") + ".";
    return { arquivos, msg };
  }

  function excluirUnidade(id) {
    const lista = unidades();
    const u = lista.find((x) => x.id === id);
    if (!u) return null;
    Store.keys().filter((k) => k.endsWith(":" + id)).forEach((k) => Store.remove(k));
    gravarLista("system_units", lista.filter((x) => x.id !== id));
    return u;
  }
  function excluirUnidades() {
    const lista = unidades();
    lista.forEach((u) => Store.keys().filter((k) => k.endsWith(":" + u.id)).forEach((k) => Store.remove(k)));
    gravarLista("system_units", []);
    return lista.length;
  }

  // ------------------------------------------------------------ importar a planilha do mês inteira
  function bancoExistente(b, lista) {
    return (lista || bancos()).find((x) => x.contaContabil === b.contabil) ||
      (lista || bancos()).find((x) => chaveNome(x.sheetName) === chaveNome(b.nomeAba)) || null;
  }
  /** Resumo do plano (Importacao.analisarPlanilha) para mostrar antes de gravar. */
  function resumoPlano(p) {
    const linhas = p.bancos.map((b) => ({ nome: b.nomeAba, nova: !bancoExistente(b), qtd: b.lancamentos.length, tipo: "lançamentos" }));
    p.movimentos.forEach((m) => linhas.push({ nome: (MOVIMENTOS.find((x) => x.id === m.id) || {}).label || m.nomeAba, qtd: m.lancamentos.length, tipo: "lançamentos" }));
    Object.keys(p.cadastros).forEach((id) => linhas.push({ nome: "Cadastro: " + CADASTROS.find((c) => c.id === id).label, qtd: p.cadastros[id].itens.length, tipo: "itens", cadastro: true }));
    return { linhas, vazio: !p.bancos.length && !p.movimentos.length };
  }
  /** Grava a planilha do mês: contas na ordem das abas, movimentos, cadastros (opcional) e distribui. */
  function aplicarPlanilha(p, mes, comCadastros) {
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error("Escolha a competência (mês).");
    definirCompetencia(mes);
    // contas bancárias: cria as que faltam e deixa na mesma ordem das abas da planilha
    // (a ordem decide o desempate dentro do mesmo dia no TXT, como na macro)
    const atuais = lerLista("system_banks", []);
    const ordem = [];
    let novas = 0;
    p.bancos.forEach((b) => {
      let conta = bancoExistente(b, atuais);
      if (!conta) {
        conta = { id: novoId("banco-"), type: "ledger", bank: b.banco, label: (b.numero ? b.numero + " " : "") + "Conta " + b.contabil,
          sheetName: b.nomeAba, agencia: "", conta: b.numero, contaContabil: b.contabil, hasDataMov: true };
        novas++;
      } else if (!conta.contaContabil) conta.contaContabil = b.contabil;
      ordem.push(conta);
      Store.set(chaveLanc(conta.id, mes), b.lancamentos);
    });
    gravarLista("system_banks", ordem.concat(atuais.filter((x) => ordem.indexOf(x) < 0)));
    p.movimentos.forEach((m) => Store.set(chaveLanc(m.id, mes), m.lancamentos));
    if (comCadastros) Object.keys(p.cadastros).forEach((id) => {
      Store.set("cadastro:" + id, p.cadastros[id].itens);
      Store.set("cabecalho:" + id, p.cadastros[id].cabecalho);
    });
    // abas de unidade deste mês: refeitas a partir dos lançamentos importados
    unidades().forEach((u) => Store.set(chaveLanc(u.id, mes), []));
    distribuir();
    avisar();
    return "Planilha importada em " + Importacao.nomeCompetencia(mes) + ": " + n(p.totalLancamentos) + " lançamentos de " +
      p.bancos.length + " contas" + (novas ? " (" + novas + " novas)" : "") + ", já distribuídos por unidade. Confira as pendências e gere os TXTs." +
      (p.avisos.length ? " Atenção: " + p.avisos.join(" ") : "");
  }

  // ------------------------------------------------------------ extratos do banco
  /** Depois de ler os arquivos: sugere a conta de cada um pelo número que vem no extrato. */
  function prepararExtratos(lidos, contaFixa) {
    const lista = bancos();
    return lidos.map((l) => {
      if (l.erro) return l;
      const cand = Extratos.contasCandidatas(l.numeroConta, lista);
      return Object.assign({}, l, { candidatas: cand.map((c) => c.id), contaId: contaFixa || (cand.length === 1 ? cand[0].id : "") });
    });
  }
  function previaExtrato(l) {
    let novos = 0, repetidos = 0;
    const porMes = {};
    l.itens.forEach((i) => { const m = String(i.data).slice(0, 7); (porMes[m] = porMes[m] || []).push(i); });
    Object.keys(porMes).forEach((m) => {
      const r = Extratos.mesclar(l.contaId ? lancamentos(l.contaId, m) : [], porMes[m]);
      novos += r.adicionados.length; repetidos += r.repetidos;
    });
    return { novos, repetidos, meses: Object.keys(porMes).sort() };
  }
  /** Tudo o que alguém já classificou, em todos os meses: base das sugestões. */
  function indiceDeSugestoes() {
    let todos = [];
    Store.keys().forEach((k) => {
      const m = /^lancamentos:\d{4}-\d{2}:(.+)$/.exec(k);
      if (m && m[1].indexOf("unid-") !== 0) todos = todos.concat(Store.get(k) || []);
    });
    return Extratos.criarIndice(todos);
  }
  /** Grava os extratos com conta escolhida. Devolve { total, repetidos, sugeridos, contas, msg }. */
  function confirmarExtratos(lidos) {
    const idx = indiceDeSugestoes();
    let total = 0, repetidos = 0, sugeridos = 0;
    const meses = {}, contas = {};
    const stamp = agora().getTime();
    lidos.forEach((l, k) => {
      if (l.erro || !l.contaId) return;
      const porMes = {};
      l.itens.forEach((i) => { const m = String(i.data).slice(0, 7); (porMes[m] = porMes[m] || []).push(i); });
      Object.keys(porMes).forEach((m) => {
        const atuais = lancamentos(l.contaId, m);
        const r = Extratos.mesclar(atuais, porMes[m]);
        repetidos += r.repetidos;
        const novos = r.adicionados.map((i, j) => {
          const e = { id: "x" + stamp + "-" + k + "-" + m + "-" + j, data: i.data, dataMov: "", desc: i.desc || "", doc: i.doc || "",
            modelo: "", valorNum: i.valorNum, sign: i.sign, nome: i.nome || "", cpf: i.cpf || "",
            categoria: "", unidade: "", natureza: "", conta: "", origem: "extrato" };
          if (i.fitid) e.fitid = i.fitid;
          if (i.bloqueado) e.bloqueado = true;
          const sug = Extratos.sugerir(e, idx);
          if (sug) { Object.assign(e, sug); e.sugerido = true; sugeridos++; }
          return e;
        });
        contas[l.contaId] = true;
        if (novos.length) { Store.set(chaveLanc(l.contaId, m), atuais.concat(novos)); meses[m] = (meses[m] || 0) + novos.length; }
        total += novos.length;
      });
    });
    const principal = Object.keys(meses).sort((a, b) => meses[b] - meses[a])[0];
    const trocou = principal && principal !== competencia();
    if (trocou) ls.setItem("competencia", principal);
    avisar();
    const msg = n(total) + " lançamento(s) novos importados" +
      (repetidos ? ", " + n(repetidos) + " já existiam e não foram duplicados" : "") +
      (sugeridos ? ". " + n(sugeridos) + " vieram com classificação sugerida pelo histórico: confira e confirme" : "") + "." +
      (trocou ? " O mês de trabalho mudou para " + Importacao.nomeCompetencia(principal) + "." : "");
    return { total, repetidos, sugeridos, contas: Object.keys(contas), msg };
  }

  // ------------------------------------------------------------ zerar, apagar, backup
  function zerarMes() {
    const mes = competencia();
    const chaves = Store.keys().filter((k) => k.indexOf("lancamentos:" + mes + ":") === 0);
    let qtd = 0;
    chaves.forEach((k) => { qtd += (Store.get(k) || []).length; });
    return { qtd, nome: Importacao.nomeCompetencia(mes), executar: () => Promise.all(chaves.map((k) => Store.remove(k))).then(avisar) };
  }
  function apagarTudo() {
    // os usuários continuam (para apagar um acesso, use a tela Usuários)
    return Promise.all(Store.keys().filter((k) => k.indexOf("auth:") !== 0).map((k) => Store.remove(k))).then(() => {
      ["system_banks", "system_units", "system_mov_contas", "competencia"].forEach((k) => ls.removeItem(k));
      avisar();
    });
  }
  const CHAVES_CONFIG = ["system_banks", "system_units", "system_mov_contas", "competencia", "tema"];
  /** O mesmo arquivo de backup da versão HTML (um restaura o do outro). modulos: dados dos módulos. */
  function backup(modulos) {
    const dados = {};
    // as contas de usuário não vão no backup de dados (vão pelo "Exportar acessos", só o admin)
    Store.keys().forEach((k) => { if (k.indexOf("auth:") !== 0) dados[k] = Store.get(k); });
    const config = {};
    CHAVES_CONFIG.forEach((k) => { const v = ls.getItem(k); if (v !== null) config[k] = v; });
    return { app: "gestao-financeira", formato: 1, geradoEm: agora().toISOString(), config, dados, modulos: modulos || {} };
  }
  /** Lê o texto do arquivo. Devolve { quando, aplicar(restaurarModulos) } ou erro. */
  function lerBackup(texto) {
    let b;
    try { b = JSON.parse(texto); } catch (e) { throw new Error("Este arquivo não é um backup válido."); }
    if (!b || b.app !== "gestao-financeira" || !b.dados) throw new Error("Este arquivo não é um backup deste sistema.");
    return {
      quando: b.geradoEm ? new Date(b.geradoEm).toLocaleString("pt-BR") : "data desconhecida",
      aplicar: (restaurarModulos) => Promise.all(Store.keys().filter((k) => k.indexOf("auth:") !== 0).map((k) => Store.remove(k)))
        .then(() => Promise.all(Object.keys(b.dados).filter((k) => k.indexOf("auth:") !== 0).map((k) => Store.set(k, b.dados[k]))))
        .then(() => {
          CHAVES_CONFIG.forEach((k) => ls.removeItem(k));
          Object.keys(b.config || {}).forEach((k) => ls.setItem(k, b.config[k]));
          // backups antigos não têm os módulos: nesse caso os dados dos módulos ficam como estão
          if (b.modulos && restaurarModulos) restaurarModulos(b.modulos);
          avisar();
        })
    };
  }

  return {
    bancos, unidades, movimentos, item, competencia, definirCompetencia, listaCompetencias, competenciasComDados,
    lancamentos, salvarLancamentos, cadastro, salvarCadastro, cabecalho, migrarParaCompetencias,
    criarConta, excluirConta, definirContaContabil,
    salvarLancamento, excluirLancamento, confirmarSugestoes, apagarDoMes, contaDaNatureza, opcoesFormulario, totais,
    colunasDoCadastro, salvarItemCadastro, excluirItemCadastro, apagarCadastro, lerAba, gravarAba,
    tabelaUnidades, nomesUnidades, idUnidade, painel, distribuir, preverTxts, gerarTxts, excluirUnidade, excluirUnidades,
    resumoPlano, aplicarPlanilha, prepararExtratos, previaExtrato, confirmarExtratos,
    zerarMes, apagarTudo, backup, lerBackup
  };
}
