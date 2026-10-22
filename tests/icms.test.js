// Apuração parcial de ICMS (src/lib/icms.mjs). Empresas e notas fictícias.
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

let I;
before(async () => { I = await import("../src/lib/icms.mjs"); });
const EMP = "11222333000181";
function nfe({ chave, emit = EMP, dest = "44555666000177", tpNF = "1", data = "2026-09-10", itens, cStat = "100" }) {
  const det = itens.map((it, i) => '<det nItem="' + (i + 1) + '"><prod><xProd>Item</xProd><CFOP>' + it.cfop + "</CFOP><vProd>" + it.v + "</vProd></prod><imposto><ICMS>" +
    (it.sn ? "<ICMSSN101><orig>0</orig><CSOSN>101</CSOSN><vCredICMSSN>" + it.sn + "</vCredICMSSN></ICMSSN101>" : it.st ? "<ICMS60><orig>0</orig><CST>60</CST></ICMS60>"
      : "<ICMS00><orig>0</orig><CST>00</CST><vBC>" + it.v + "</vBC><pICMS>17</pICMS><vICMS>" + it.icms + "</vICMS></ICMS00>") + "</ICMS></imposto></det>").join("");
  return '<?xml version="1.0"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe' + chave + '"><ide><mod>55</mod><serie>1</serie><nNF>' + chave.slice(-3) +
    "</nNF><dhEmi>" + data + "T10:00:00-03:00</dhEmi><tpNF>" + tpNF + "</tpNF></ide><emit><CNPJ>" + emit + "</CNPJ><xNome>Emitente</xNome></emit><dest><CNPJ>" + dest +
    "</CNPJ><xNome>Destino</xNome></dest>" + det + "<total><ICMSTot><vNF>1000.00</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><chNFe>" + chave + "</chNFe><cStat>" + cStat + "</cStat></infProt></protNFe></nfeProc>";
}

describe("leitura do XML", () => {
  test("NF-e com itens, cancelamento, resumo e lixo", () => {
    const r = I.lerXml(nfe({ chave: "42260911222333000181550010000001011", itens: [{ cfop: "5102", v: "1000.00", icms: "170.00" }, { cfop: "5405", v: "200.00", st: true }] }));
    assert.equal(r.tipo, "nfe");
    assert.deepEqual([r.nota.chave, r.nota.data, r.nota.tpNF, r.nota.emit.doc, r.nota.itens.length], ["42260911222333000181550010000001011", "2026-09-10", "1", EMP, 2]);
    assert.deepEqual([r.nota.itens[0].icms, r.nota.itens[0].cst, r.nota.itens[1].icms], [170, "000", 0]);
    const c = I.lerXml('<procEventoNFe><evento><infEvento><chNFe>ABC</chNFe><tpEvento>110111</tpEvento></infEvento></evento></procEventoNFe>');
    assert.deepEqual(c, { tipo: "cancelamento", chaves: ["ABC"] });
    assert.equal(I.lerXml("<resNFe><chNFe>X</chNFe></resNFe>").tipo, "resumo");
    assert.equal(I.lerXml("não é xml").tipo, "invalido");
  });
  test("CFOP de entrada equivalente e regras padrão", () => {
    assert.deepEqual(["5102", "6102", "7102", "5405", "6403", "1202"].map(I.cfopEntrada), ["1102", "2102", "3102", "1403", "2403", "1202"]);
    assert.equal(I.regraPadrao("S", "5929"), false);
    assert.equal(I.regraPadrao("E", "1556"), false);
    assert.equal(I.regraPadrao("E", "1102"), true);
    assert.equal(I.regraDe({ "E:1102": false }, "E", "1102"), false);
  });
});

describe("apuração", () => {
  const ler = (x) => I.lerXml(x).nota;
  const notas = () => [
    ler(nfe({ chave: "A001", itens: [{ cfop: "5102", v: "1000.00", icms: "170.00" }] })),                                       // saída: débito 170
    ler(nfe({ chave: "A002", data: "2026-09-12", itens: [{ cfop: "5929", v: "500.00", icms: "85.00" }] })),                      // 5929: não entra
    ler(nfe({ chave: "B001", emit: "22333444000110", dest: EMP, data: "2026-09-05", itens: [{ cfop: "5102", v: "600.00", icms: "102.00" }] })),   // compra: crédito 102 (CFOP 1102)
    ler(nfe({ chave: "B002", emit: "55666777000130", dest: EMP, data: "2026-09-06", itens: [{ cfop: "5101", v: "300.00", sn: "7.68" }] })),      // Simples: crédito 7,68
    ler(nfe({ chave: "B003", emit: "66777888000140", dest: EMP, data: "2026-09-07", itens: [{ cfop: "5405", v: "400.00", st: true }] })),         // ST: 1403, não entra
    ler(nfe({ chave: "A003", data: "2026-09-20", itens: [{ cfop: "5102", v: "1000.00", icms: "170.00" }] })),                     // cancelada pelo evento
    ler(nfe({ chave: "A004", tpNF: "0", dest: "48111222000190", data: "2026-09-18", itens: [{ cfop: "1202", v: "100.00", icms: "17.00" }] })),   // devolução de venda: crédito 17
    ler(nfe({ chave: "Z001", emit: "99999999000199", dest: "88888888000188", itens: [{ cfop: "5102", v: "1.00", icms: "1.00" }] }))   // de outra empresa
  ];
  test("débitos, créditos, CFOP, Simples, ST, cancelada, outras empresas", () => {
    const n = notas();
    assert.equal(I.empresasDasNotas(n)[0].doc, EMP);
    const p = I.periodoPadrao(n, EMP);
    assert.deepEqual(p, { de: "2026-09-01", ate: "2026-09-20" });
    const r = I.apurar({ notas: n, canceladas: ["A003"], empresa: EMP, de: p.de, ate: p.ate, regras: {} });
    assert.deepEqual([r.deb, r.cred, r.saldo], [170, 126.68, 43.32]);
    assert.deepEqual([r.nS, r.nE, r.nX, r.fora], [2, 4, 1, 1]);
    const g = (k) => r.grupos.find((x) => x.dir + ":" + x.cfop === k);
    assert.deepEqual([g("E:1102").icms, [...g("E:1102").origens]], [102, ["5102"]]);
    assert.deepEqual([g("E:1101").credSN, g("E:1403").entra, g("S:5929").entra], [7.68, false, false]);
    const ate10 = I.apurar({ notas: n, canceladas: [], empresa: EMP, de: "2026-09-01", ate: "2026-09-10" });
    assert.deepEqual([ate10.deb, ate10.cred], [170, 109.68], "até o dia 10");
  });
  test("ajustes e regra trocada mudam o saldo; acumulado por dia", () => {
    const r = I.apurar({ notas: notas(), canceladas: ["A003"], empresa: EMP, de: "2026-09-01", ate: "2026-09-30",
      regras: { "S:5929": true }, ajustes: { saldoAnt: 50, outCred: 10, outDeb: 5 } });
    assert.deepEqual([r.deb, r.debTot, r.credTot, r.saldo], [255, 260, 186.68, 73.32]);
    const ac = I.acumulado(r.diario, "2026-09-01", "2026-09-12");
    assert.equal(ac.length, 12);
    assert.deepEqual(ac[11], { dia: "2026-09-12", deb: 255, cred: 109.68 });
  });
  test("exemplo gera notas lidas e um cancelamento", () => {
    const xs = I.xmlsDeExemplo("2026-09").map(I.lerXml);
    assert.ok(xs.filter((x) => x.tipo === "nfe").length > 40);
    assert.equal(xs.filter((x) => x.tipo === "cancelamento").length, 1);
    assert.equal(I.lerValor("1.234,56"), 1234.56);
    assert.equal(I.lerValor("R$ 10"), 10);
  });
});
