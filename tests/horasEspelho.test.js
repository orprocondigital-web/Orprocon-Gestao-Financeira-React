// Controle de horas: espelho de ponto para imprimir (src/lib/horas/espelho.mjs). Empresa e nomes fictícios.
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const H = require("../src/lib/horas/dados.mjs").default;
const E = require("../src/lib/horas/espelho.mjs");

function mesExemplo() {
  const e = H.estadoVazio();
  const ex = H.exemplo(e, new Date(2026, 9, 15));   // setembro de 2026
  return { e, ex, r: H.resumoMes(e, ex.empresa.id, ex.mes) };
}
const paginas = (html) => (html.match(/<section class="pagina">/g) || []).length;

describe("espelho de ponto", () => {
  test("uma página por funcionário com folha, com cabeçalho, dias do mês e assinaturas", () => {
    const { r } = mesExemplo();
    const { html, quantos } = E.espelhoHtml(r);
    assert.equal(quantos, 4);
    assert.equal(paginas(html), 4);
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /Comércio Exemplo Ltda/);
    assert.match(html, /CNPJ 00\.000\.000\/0001-00/);
    assert.match(html, /class="mes">Setembro\/2026/);
    assert.equal((html.match(/<small>Funcionário<\/small>/g) || []).length, 4, "assinatura do funcionário em cada página");
    // setembro tem 30 dias: 30 linhas no corpo de cada tabela de dias
    const corpo = html.split("<tbody>")[1].split("</tbody>")[0];
    assert.equal((corpo.match(/<tr/g) || []).length, 30);
    assert.match(html, /Feriado: Independência/, "o 7 de setembro aparece como feriado");
  });

  test("só os funcionários escolhidos, e os totais batem com o cálculo do mês", () => {
    const { r } = mesExemplo();
    const ana = r.linhas.find((l) => l.func.nome === "Ana Exemplo");
    const { html, quantos } = E.espelhoHtml(r, { ids: [ana.func.id] });
    assert.equal(quantos, 1);
    assert.doesNotMatch(html, /Bruno Exemplo/);
    const t = ana.calc.totais;
    const rodape = html.split("<tfoot>")[1].split("</tfoot>")[0];
    const R = require("../src/lib/horas/regras.mjs").default;
    assert.ok(rodape.includes(R.fmt(t.trabalhado)), "total trabalhado");
    Object.keys(t.extras).forEach((p) => assert.ok(html.includes("HE " + p + "%") && rodape.includes(R.fmt(t.extras[p])), "extra " + p + "%"));
  });

  test("atestado, falta e observação aparecem na coluna de ocorrência; alertas só se pedir", () => {
    const { e, ex } = mesExemplo();
    const [bruno, carla] = ex.empresa.funcionarios.slice(1, 3);
    H.atualizarDia(e, ex.empresa.id, ex.mes, bruno.id, 14, { e1: null, s1: null, e2: null, s2: null, oc: "Atestado", obs: "Atestado de 1 dia" });
    H.atualizarDia(e, ex.empresa.id, ex.mes, carla.id, 15, { e1: null, s1: null, e2: null, s2: null, oc: "Falta" });
    H.marcarRevisada(e, ex.empresa.id, ex.mes, bruno.id, true);
    const r = H.resumoMes(e, ex.empresa.id, ex.mes);
    const sem = E.espelhoHtml(r).html, com = E.espelhoHtml(r, { alertas: true, situacao: true }).html;
    assert.match(sem, /Atestado · Atestado de 1 dia/);
    assert.match(sem, />Falta</);
    assert.match(sem, /Inventário/);
    assert.doesNotMatch(sem, /Alertas<\/th>/);
    assert.match(com, /Alertas<\/th>/);
    assert.match(com, /Marcação incompleta/);
    assert.match(com, /Ainda não conferida/);
    assert.match(com, /Conferida/);
  });

  test("nome com < e & não quebra a página", () => {
    const { e, ex } = mesExemplo();
    ex.empresa.funcionarios[0].nome = "Ana <b>Teste</b> & Cia";
    const { html } = E.espelhoHtml(H.resumoMes(e, ex.empresa.id, ex.mes));
    assert.match(html, /Ana &lt;b&gt;Teste&lt;\/b&gt; &amp; Cia/);
    assert.doesNotMatch(html, /<b>Teste<\/b>/);
  });

  test("sem folha no mês: nada para imprimir", () => {
    const { e, ex } = mesExemplo();
    const outro = H.resumoMes(e, ex.empresa.id, "2026-08");
    assert.equal(E.espelhoHtml(outro).quantos, 0);
  });
});
