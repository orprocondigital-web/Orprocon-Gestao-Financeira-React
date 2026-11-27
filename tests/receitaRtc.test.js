// Auditor IBS/CBS com a calculadora da Receita (src/lib/receitaRtc.mjs). Notas fictícias.
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const R = require("../src/lib/receitaRtc.mjs");

const XML = `<nfeProc><NFe><infNFe Id="NFe42261100000000000191550010000090011000000010" versao="4.00"><ide><cUF>42</cUF><mod>55</mod>
<nNF>9001</nNF><dhEmi>2026-11-20T10:15:00-03:00</dhEmi><cMunFG>4218707</cMunFG></ide></infNFe></NFe></nfeProc>`;

const item = (o) => Object.assign({ nItem: "1", found: true, cst: "000", cClassTrib: "000001", ncm: "8471.30.12", bc: 1000, vProd: 1000, qCom: 2, vCbs: 9, vIbsUf: 1, vIbsMun: 0 }, o);

describe("contexto da nota", () => {
  test("lê data, modelo, município, UF e chave", () => {
    const c = R.contextoNota(XML);
    assert.deepEqual(c, { chave: "42261100000000000191550010000090011000000010", dhEmi: "2026-11-20T10:15:00-03:00", modelo: "55", municipio: "4218707", uf: "SC" });
    assert.deepEqual(R.contextoNota("<x/>"), { chave: "", dhEmi: "", modelo: "", municipio: "", uf: "" });
  });
  test("data no formato da Receita", () => {
    assert.equal(R.dataHoraReceita("2026-11-20T10:15-03:00"), "2026-11-20T10:15:00-03:00");
    assert.equal(R.dataHoraReceita("2026-11-20"), "2026-11-20T12:00:00-03:00");
    assert.equal(R.dataHoraReceita("20/11/2026"), "");
  });
});

describe("operação", () => {
  test("monta a OperacaoInput e separa os itens que não dá para calcular", () => {
    const ctx = R.contextoNota(XML);
    const r = R.montarOperacao([item(), item({ nItem: "2", cClassTrib: "" }), item({ nItem: "3", found: false }), item({ nItem: "4", bc: null, vProd: 50.456 })], ctx, "nota-1");
    assert.equal(r.erro, null);
    assert.deepEqual(r.enviados, [1, 4]);
    assert.deepEqual(r.fora.map((f) => f.nItem), [2, 3]);
    assert.deepEqual(r.operacao, {
      id: "nota-1", versao: "0.0.1", dhFatoGerador: "2026-11-20T10:15:00-03:00", municipio: 4218707, uf: "SC", tpDoc: 55,
      itens: [
        { numero: 1, cst: "000", cClassTrib: "000001", baseCalculo: 1000, ncm: "84713012", quantidade: 2, unidade: "UN" },
        { numero: 4, cst: "000", cClassTrib: "000001", baseCalculo: 50.46, ncm: "84713012", quantidade: 2, unidade: "UN" }
      ]
    });
  });
  test("recusa nota sem data, sem município, de 2027 ou sem itens válidos", () => {
    assert.match(R.montarOperacao([item()], { municipio: "4218707" }).erro, /Data de emissão/);
    assert.match(R.montarOperacao([item()], { dhEmi: "2026-11-20" }).erro, /cMunFG/);
    assert.match(R.montarOperacao([item()], { dhEmi: "2027-01-05", municipio: "4218707" }).erro, /2027/);
    assert.match(R.montarOperacao([item({ found: false })], { dhEmi: "2026-11-20", municipio: "4218707" }).erro, /Nenhum item/);
  });
});

const ROC = { objetos: [
  { nObj: 1, tribCalc: { IBSCBS: { CST: "000", cClassTrib: "000001", gIBSCBS: { vBC: "1000.00",
    gIBSUF: { pIBSUF: "0.1000", vIBSUF: "1.00", memoriaCalculo: "1000 x 0,1%" },
    gIBSMun: { pIBSMun: "0.0000", vIBSMun: "0.00" }, vIBS: "1.00",
    gCBS: { pCBS: "0.9000", vCBS: "9.00", memoriaCalculo: "1000 x 0,9%" } } } } },
  { nobj: 4, tribcalc: { ibscbs: { cst: "200", cclasstrib: "200003", gibscbs: { vbc: 50.46,
    gibsuf: { pibsuf: 0.1, vibsuf: 0.02, gred: { pRedAliq: 60, pAliqEfet: 0.04 } }, gibsmun: { pibsmun: 0, vibsmun: 0 },
    gcbs: { pcbs: 0.9, vcbs: 0.18 } } } } }
] };

describe("resposta da Receita", () => {
  test("lê item a item, sem ligar para maiúsculas", () => {
    const l = R.lerResultado(ROC);
    assert.deepEqual([l[1].vBC, l[1].vCbs, l[1].vIbsUf, l[1].vIbsMun, l[1].vIbs, l[1].memoria.length], [1000, 9, 1, 0, 1, 2]);
    assert.deepEqual([l[4].cst, l[4].vCbs, l[4].vIbsUf, l[4].redUf], ["200", 0.18, 0.02, { pRedAliq: 60, pAliqEfet: 0.04 }]);
    assert.deepEqual(R.lerResultado(null), {});
  });
  test("compara a nota com a Receita (tolerância de 1 centavo)", () => {
    const l = R.lerResultado(ROC);
    assert.deepEqual(R.compararComReceita(item(), l[1]), { nivel: "ok", msgs: [] });
    assert.deepEqual(R.compararComReceita(item({ vCbs: 9.01 }), l[1]).nivel, "ok");
    const e = R.compararComReceita(item({ vCbs: 10, bc: 1100 }), l[1]);
    assert.equal(e.nivel, "erro");
    assert.equal(e.msgs.length, 2);
    assert.match(e.msgs[0], /^CBS: na nota R\$ 10,00, pela Receita R\$ 9,00/);
    assert.equal(R.compararComReceita(item(), undefined).nivel, "sem");
  });
  test("mensagens de erro e versão", () => {
    assert.equal(R.mensagemErro('{"titulo":"Erro de validação","objects":[{"userMessage":"cClassTrib inválido"}]}'), "Erro de validação · cClassTrib inválido");
    assert.equal(R.mensagemErro("texto puro"), "texto puro");
    assert.equal(R.mensagemErro(null), "A Receita recusou a operação.");
    assert.equal(R.textoVersao({ versaoApp: "1.7.3-a286b4b3", versaoDb: "V0074", dataVersaoDb: "2026-11-26" }), "Regras da Receita: V0074 de 26/11/2026 (calculadora 1.7.3)");
  });
});
