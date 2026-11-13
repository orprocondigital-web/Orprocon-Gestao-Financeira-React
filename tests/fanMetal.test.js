// Fam Metal (src/lib/fan/regrasFan.mjs): as regras da planilha v5 no sistema. Empresas, CNPJs, nomes e valores fictícios.
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

let R, cfg;
const EMP = "11222333000181";
before(async () => {
  R = await import("../src/lib/fan/regrasFan.mjs");
  cfg = Object.assign(R.configPadrao(), {
    cnpjEmpresa: EMP, nomeEmpresa: "EMPRESA EXEMPLO",
    fornecedores: { "44555666000177": "ACO EXEMPLO LTDA", "77888999000155": "FERRAGENS MODELO LTDA" },
    funcionarios: ["JOAO DA SILVA EXEMPLO", "MARIA FICTICIA SOUZA"],
    cheques: { "000123": { portador: "PEDRO PORTADOR", cnpj: "" } },
    bancos: [
      { id: "SICREDI", nome: "Sicredi", conta: "627", numeros: ["999991"], palavras: ["SICREDI"] },
      { id: "BB", nome: "Banco do Brasil", conta: "615", numeros: ["888882"], palavras: ["BRASIL", "BB"] },
      { id: "CEF", nome: "Caixa", conta: "625", numeros: ["777773"], palavras: ["CAIXA"] }
    ],
    contratosEmprestimo: ["C40799999"]
  });
});
const SIC = { conta: "627" };
const cl = (texto, valor = -100) => R.classificar({ texto, valor, banco: SIC }, cfg);

describe("classificação na ordem da v5", () => {
  test("transferência própria, FGTS, DARF/IOF/tarifa, folha em lote, consórcio, empréstimo e cheque", () => {
    assert.equal(cl("PIX ENVIADO 11222333000181 EMPRESA EXEMPLO").categoria, "Transferencia Bancaria");
    assert.equal(cl("PAGAMENTO FGTS GRF").categoria, "FGTS");
    assert.equal(cl("CONVENIO 00360305000104 FUNDO").categoria, "FGTS", "CNPJ da Caixa como administradora do FGTS");
    assert.deepEqual([cl("PAGAMENTO DARF 0561").d, cl("PAGAMENTO DARF 0561").c], ["5", "627"]);
    assert.equal(cl("IOF S/ OPER. CREDITO PJ").d, "571");
    assert.equal(cl("CLIENTE COM IOF NO NOME").categoria, "", "IOF só no começo");
    assert.equal(cl("DEB TARIFA PACOTE").d, "565");
    assert.equal(cl("DB FOL PAG - 114095").categoria, "Folha");
    assert.equal(cl("DEB. FOLHA PAGTO-H55").categoria, "Folha", "também o 'FOLHA PAG' do Sicredi");
    assert.deepEqual([cl("DEBITO CONVENIOS ID 0147509311222333000181 CONSORCIO").categoria, cl("DEBITO CONVENIOS ID 0147509311222333000181 CONSORCIO").contaConsorcio], ["Transferencia Bancaria", undefined],
      "o CNPJ da própria empresa no histórico vem antes (como na v5)");
    assert.equal(cl("BB CONSÓRCIO - PRESTAÇÃO").contaConsorcio, "700");
    assert.equal(cl("IBC VOLVO CONSORCIO").contaConsorcio, "7772");
    assert.equal(cl("LIQUIDACAO DE PARCELA C40799999").categoria, "Emprestimo");
    assert.equal(cl("BB GIRO - 827900000").categoria, "Emprestimo");
    assert.deepEqual([cl("CHEQUE COMPENSADO ALW000123").categoria, cl("CHEQUE COMPENSADO ALW000123").participante], ["Folha", "PEDRO PORTADOR"]);
  });
  test("fornecedor pelo CNPJ ou pelo nome; funcionário pelo CPF e nome; entrada = recebimento; sobra = revisar", () => {
    assert.deepEqual([cl("LIQUIDACAO BOLETO 44555666000177 ACO EXEMP").categoria, cl("LIQUIDACAO BOLETO 44555666000177 ACO EXEMP").participante], ["Fornecedor", "ACO EXEMPLO LTDA"]);
    const n = cl("PIX - ENVIADO - 02/09 10:00 FERRAGENS MODELO");
    assert.deepEqual([n.categoria, n.cnpj, n.regra], ["Fornecedor", "77888999000155", "nome na lista"]);
    assert.deepEqual([cl("PAGAMENTO PIX 12345678901 Joao da Silva Exemplo").categoria, cl("PAGAMENTO PIX 12345678901 Joao da Silva Exemplo").participante], ["Folha", "JOAO DA SILVA EXEMPLO"]);
    const rec = cl("RECEBIMENTO PIX 99888777000166 CLIENTE MODELO", 500);
    assert.deepEqual([rec.categoria, rec.status, rec.cnpj], ["Recebimento", "REVISAR", "99888777000166"], "entrada com nome: conferir o cliente");
    assert.equal(cl("CREDITO SEM NOME", 50).status, "OK");
    const s = cl("LIQUIDACAO BOLETO 55444333000122 DESCONHECIDA LTDA");
    assert.deepEqual([s.categoria, s.status, s.cnpj, s.nomeSugerido], ["", "REVISAR", "55444333000122", "DESCONHECIDA LTDA"]);
  });
  test("regra da pessoa vem antes; balancete conhece o fornecedor que a lista não tem", () => {
    const c2 = Object.assign({}, cfg, { regras: [{ contem: "ARRECADACAO ESTADUAL", categoria: "Conciliacao Manual", d: "999", c: "banco" }] });
    const r = R.classificar({ texto: "ARRECADACAO ESTADUAL-SFSC 123", valor: -10, banco: SIC }, c2);
    assert.deepEqual([r.categoria, r.d, r.c], ["Conciliacao Manual", "999", "627"]);
    const c3 = Object.assign({}, cfg, { balancete: { fornecedores: [{ classif: "02.1.1.01.000000001", nome: "DELTA COMERCIO DE FERRAMENTAS LTDA", raiz: "" },
      { classif: "02.1.1.01.000000002", nome: "18.663.698 FULANO MEI", raiz: "18663698" }] } });
    const b = R.classificar({ texto: "LIQUIDACAO BOLETO 55444333000122 DELTA COM DE F", valor: -10, banco: SIC }, c3);
    assert.deepEqual([b.categoria, b.cnpj, b.regra], ["Fornecedor", "55444333000122", "balancete"]);
    assert.equal(R.classificar({ texto: "PIX 18663698000150 OUTRO NOME", valor: -10, banco: SIC }, c3).participante, "18.663.698 FULANO MEI", "raiz do CNPJ do MEI");
    assert.equal(R.nomeBate("DELTA COM DE F", "DELTA COMERCIO DE FERRAMENTAS"), true);
    assert.equal(R.nomeBate("DELTA COM DE F", "OMEGA DELTA COMERCIO"), false, "a primeira palavra tem que ser a primeira");
  });
});

describe("contas e TXT do Único", () => {
  test("contas por categoria (como o ClassificarParaTXT)", () => {
    const L = (categoria, valor = -10, extra) => Object.assign({ categoria, valor, banco: { conta: "627" } }, extra);
    assert.deepEqual(R.contasDaLinha(L("Fornecedor"), cfg), { d: "148", c: "627", ladoCnpj: "C" });
    assert.deepEqual(R.contasDaLinha(L("Recebimento", 10), cfg), { d: "627", c: "16", ladoCnpj: "D" });
    assert.deepEqual(R.contasDaLinha(L("Emprestimo", 10), cfg), { d: "627", c: "8329", ladoCnpj: "" });
    assert.deepEqual(R.contasDaLinha(L("Consorcio", -10, { contaConsorcio: "700" }), cfg), { d: "700", c: "627", ladoCnpj: "" });
    assert.equal(R.contasDaLinha(L("Transferencia Bancaria"), cfg, ""), null, "sem banco de destino não lança");
    assert.equal(R.contasDaLinha(L("Conciliacao Manual", -10, { d: "5" }), cfg), null);
  });
  test("linha do TXT: seq, data, contas, valor, complemento, DCTO, categoria_banco, CNPJ no lado certo", () => {
    const linhas = [
      { status: "OK", data: "2026-09-01", d: "148", c: "627", valor: -4606.59, texto: "LIQUIDACAO BOLETO 44555666000177 ACO, EXEMPLO", documento: "266246",
        categoria: "Fornecedor", bancoId: "SICREDI", cnpj: "44555666000177", ladoCnpj: "C" },
      { status: "OK", data: "2026-09-02", d: "627", c: "16", valor: 500, texto: "1234 - RECEBIMENTO", documento: "PIX_CRED", categoria: "Recebimento", bancoId: "SICREDI", cnpj: "CPF:12345678901", ladoCnpj: "D" },
      { status: "REVISAR", data: "2026-09-02", valor: -1, texto: "X", categoria: "" },
      { status: "OK", soNoOutroBanco: true, data: "2026-09-03", valor: 10, texto: "Y", categoria: "Transferencia Bancaria" }
    ];
    const t = R.txtUnicoFan(linhas);
    assert.equal(t.exportadas, 2);
    assert.deepEqual(t.texto.split("\r\n"), [
      "000001,20260901,148,627,4606.59,,LIQUIDACAO BOLETO 44555666000177 ACO; EXEMPLO,DCTO266246,Fornecedor_SICREDI,,44555666000177,,,,,A",
      "000002,20260902,627,16,500.00,,1234 - RECEBIMENTO,DCTO1234,Recebimento_SICREDI,12345678901,,,,,,A",
      ""
    ]);
  });
});

describe("o mês: bancos, transferências, comprovantes e decisões", () => {
  const ext = () => [
    { bancoId: "SICREDI", linhas: R.linhasDoExtrato([
      { data: "2026-09-01", desc: "LIQUIDACAO BOLETO 44555666000177 ACO EXEMP", valorNum: 1000, sign: "D", doc: "1" },
      { data: "2026-09-02", desc: "PIX ENVIADO EMPRESA EXEMPLO", valorNum: 5000, sign: "D", doc: "PIX_DEB" },
      { data: "2026-09-03", desc: "LIQUIDACAO BOLETO SICREDI", valorNum: 250, sign: "D", doc: "2" },
      { data: "2026-09-04", desc: "LIQUIDACAO BOLETO 55444333000122 NOVA LTDA", valorNum: 80, sign: "D", doc: "3" },
      { data: "2026-09-04", desc: "SALDO", valorNum: 0, sign: "C" }
    ], "SICREDI") },
    { bancoId: "BB", linhas: R.linhasDoExtrato([{ data: "2026-09-02", desc: "TED RECEBIDA EMPRESA EXEMPLO", valorNum: 5000, sign: "C" }], "BB") }
  ];
  test("transferência casa a saída com a entrada do outro banco; a entrada não vai para o TXT", () => {
    const m = R.montarMes(ext(), cfg);
    assert.equal(m.resumo.total, 5, "linha de saldo zerado fica fora");
    const sai = m.linhas.find((l) => l.bancoId === "SICREDI" && l.categoria === "Transferencia Bancaria");
    assert.deepEqual([sai.bancoDestino, sai.d, sai.c, sai.status], ["BB", "615", "627", "OK"]);
    const entra = m.linhas.find((l) => l.bancoId === "BB");
    assert.equal(entra.soNoOutroBanco, true);
    assert.equal(R.txtUnicoFan(m.linhas).exportadas, 2, "fornecedor + transferência (a entrada não)");
  });
  test("comprovante resolve a linha sem CNPJ; decisão da pessoa vale por cima e ensina a lista", () => {
    const comp = R.lerComprovante("Razão Social do Beneficiário: ACO EXEMPLO LTDA\nCPF/CNPJ do Beneficiário: 44.555.666/0001-77\nData do Pagamento: 03/09/2026\nValor Pago (R$): 250,00", "x.pdf");
    assert.deepEqual([comp.data, comp.valor, comp.cnpj], ["2026-09-03", 250, "44555666000177"]);
    const m = R.montarMes(ext(), cfg, {}, [comp]);
    const l = m.linhas.find((x) => x.valor === -250);
    assert.deepEqual([l.categoria, l.participante, l.regra, l.status], ["Fornecedor", "ACO EXEMPLO LTDA", "comprovante", "OK"]);
    const nova = m.linhas.find((x) => x.valor === -80);
    assert.equal(nova.status, "REVISAR");
    const dec = { categoria: "Fornecedor", cnpj: "55444333000122", participante: "NOVA LTDA" };
    const m2 = R.montarMes(ext(), cfg, { [nova.chave]: dec }, [comp]);
    const n2 = m2.linhas.find((x) => x.chave === nova.chave);
    assert.deepEqual([n2.status, n2.d, n2.c, n2.manual], ["OK", "148", "627", true]);
    const aprendeu = R.aprender(cfg, dec);
    assert.equal(aprendeu.fornecedores["55444333000122"], "NOVA LTDA");
    assert.equal(R.classificar({ texto: "LIQUIDACAO BOLETO 55444333000122 NOVA", valor: -1, banco: SIC }, aprendeu).categoria, "Fornecedor", "no mês seguinte já vem resolvido");
  });
  test("linha de outro mês fica FORA: não conta no resumo, não vai para o TXT nem para o balancete", () => {
    const e = ext();
    e[0].linhas = e[0].linhas.concat(R.linhasDoExtrato([
      { data: "2026-08-29", desc: "LIQUIDACAO BOLETO 44555666000177 ACO EXEMP", valorNum: 700, sign: "D", doc: "9" },
      { data: "2026-10-01", desc: "LIQUIDACAO BOLETO 44555666000177 ACO EXEMP", valorNum: 300, sign: "D", doc: "8" }
    ], "SICREDI"));
    const sem = R.montarMes(e, cfg);
    assert.equal(R.txtUnicoFan(sem.linhas).exportadas, 4, "sem competência, como antes: tudo entra");
    const m = R.montarMes(e, cfg, {}, [], "2026-09");
    assert.deepEqual([m.resumo.total, m.resumo.fora], [5, 2]);
    const f = m.linhas.filter((l) => l.foraDoMes);
    assert.deepEqual(f.map((l) => [l.status, l.motivo]), [["FORA", "fora de 09/2026"], ["FORA", "fora de 09/2026"]]);
    assert.equal(R.txtUnicoFan(m.linhas).exportadas, 2);
    const bal = { fornecedores: [{ classif: "1", nome: "ACO EXEMPLO LTDA", cnpj: "44555666000177", debito: 1000 }] };
    const c = R.conferirBalancete(m.linhas, bal);
    assert.equal(c.linhas[0].totalBanco, 1000, "só o pagamento de setembro");
  });
  test("comprovante pelo nome do arquivo quando o PDF não tem texto", () => {
    const c = R.lerComprovante("", "05-09-2026 - FERRAGENS MODELO LTDA - PAGO SICREDI - 1.234,56.pdf");
    assert.deepEqual([c.data, c.valor, c.nome], ["2026-09-05", 1234.56, "FERRAGENS MODELO LTDA"]);
  });
  test("banco do extrato pelo número da conta ou pelo nome do arquivo", () => {
    assert.equal(R.bancoDoExtrato("2604000000999991", "x.ofx", cfg), "SICREDI");
    assert.equal(R.bancoDoExtrato("", "EXTRATO BRASIL - SETEMBRO.ofx", cfg), "BB");
    assert.equal(R.bancoDoExtrato("", "EXTRATO CAIXA.xlsx", cfg), "CEF");
    assert.equal(R.bancoDoExtrato("", "outro.ofx", cfg), "");
  });
});

describe("arquivos do escritório", () => {
  test("balancete em PDF: nome comprido quebra a linha, valores negativos entre parênteses", () => {
    const t = [
      "Balancete Consolidado de 01/09/2026 a 30/09/2026 Página: 1",
      "147 02.1.1.01 FORNECEDORES 1.000,00 2.000,00 3.000,00 2.000,00",
      "148 02.1.1.01.000000001 ACO EXEMPLO LTDA 100,00 50,00 0,00 50,00",
      "148 02.1.1.01.000000002 FERRAGENS MODELO COMERCIO DE FERRAGENS E MATERIAIS 1.500,00",
      "LTDA 200,00 10,00 1.310,00",
      "148 02.1.1.01.000000003 18.663.698 FULANO MEI (5,00) 0,00 5,00 (10,00)"
    ].join("\n");
    const b = R.lerBalancetePdf(t);
    assert.equal(b.ok, true);
    assert.deepEqual(b.periodo, { inicio: "2026-09-01", fim: "2026-09-30" });
    assert.deepEqual(b.fornecedores.map((f) => [f.classif, f.nome, f.debito, f.saldoAtual]), [
      ["02.1.1.01.000000001", "ACO EXEMPLO LTDA", 50, 50],
      ["02.1.1.01.000000002", "FERRAGENS MODELO COMERCIO DE FERRAGENS E MATERIAIS LTDA", 200, 1310],
      ["02.1.1.01.000000003", "18.663.698 FULANO MEI", 0, -10]
    ]);
    assert.equal(b.fornecedores[2].raiz, "18663698");
  });
  test("conferência com o balancete: soma por fornecedor × débito", () => {
    const bal = { fornecedores: [
      { classif: "02.1.1.01.000000001", nome: "ACO EXEMPLO LTDA", raiz: "", debito: 150 },
      { classif: "02.1.1.01.000000002", nome: "18.663.698 FULANO MEI", raiz: "18663698", debito: 40 },
      { classif: "02.1.1.01.000000003", nome: "SO NO BALANCETE LTDA", raiz: "", debito: 9 }
    ] };
    const linhas = [
      { categoria: "Fornecedor", valor: -100, cnpj: "44555666000177", participante: "ACO EXEMPLO" },
      { categoria: "Fornecedor", valor: -50, cnpj: "44555666000177", participante: "ACO EXEMPLO" },
      { categoria: "Fornecedor", valor: -30, cnpj: "18663698000150", participante: "" },
      { categoria: "Fornecedor", valor: -7, cnpj: "", participante: "NINGUEM CONHECIDO" },
      { categoria: "Folha", valor: -999, participante: "JOAO" }
    ];
    const r = R.conferirBalancete(linhas, bal);
    assert.deepEqual(r.linhas.map((l) => [l.fornecedor.nome, l.status, l.diferenca]), [
      ["ACO EXEMPLO LTDA", "bate", 0], ["18.663.698 FULANO MEI", "diferenca", -10], ["SO NO BALANCETE LTDA", "so_balancete", -9]
    ]);
    assert.equal(r.resumo.semFornecedor, 1);
    assert.equal(r.resumo.semFornecedorValor, 7);
  });
  test("trecho para regra: o começo do histórico até o primeiro número", () => {
    assert.equal(R.trechoParaRegra("ARRECADACAO ESTADUAL-SFSC-12345 09/2026"), "ARRECADACAO ESTADUAL-SFSC");
    assert.equal(R.trechoParaRegra("Pagamento Pix 44555666000177 ACO"), "PAGAMENTO PIX");
    const t = "RENDE FÁCIL APLICACAO";
    assert.ok(R.norm(t).includes(R.trechoParaRegra(t)));
  });
  test("listas da planilha v5", () => {
    const l = R.listasDaV5([
      { nome: "_FORNECEDORES", rows: [["CNPJ", "NOME"], ["44555666000177", "ACO EXEMPLO"], ["4555666000177", "SEM ZERO"], ["x", "lixo"]] },
      { nome: "_FUNCIONARIOS", rows: [["NOME"], ["JOAO EXEMPLO"], [""]] },
      { nome: "_CHEQUES", rows: [["NUMERO", "PORTADOR", "CNPJ"], [123, "PEDRO", ""]] }
    ]);
    assert.deepEqual(l.fornecedores, { "44555666000177": "ACO EXEMPLO", "04555666000177": "SEM ZERO" });
    assert.deepEqual(l.funcionarios, ["JOAO EXEMPLO"]);
    assert.deepEqual(l.cheques, { "000123": { portador: "PEDRO", cnpj: "" } });
  });
});
