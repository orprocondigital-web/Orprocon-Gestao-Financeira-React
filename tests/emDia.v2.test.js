// Em Dia simples (src/lib/emDia.mjs): grade por setor e mês, responsáveis, bastão, diário e importação.
// Empresas e pessoas fictícias.
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

let E;
before(async () => { E = await import("../src/lib/emDia.mjs"); });
function amb(inicial) {
  const ls = Object.assign({ "painelVencimentos:v1": JSON.stringify({ clientes: [
    { id: "c1", nome: "Alfa Comércio Ltda", documento: "11.111.111/0001-11" }, { id: "c2", nome: "Beta Serviços ME", documento: "" }], documentos: [] }) }, inicial);
  let m = 0;
  const svc = E.criarEmDia({ ls: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } },
    agora: () => new Date(2026, 9, 20, 10), aoMudar: () => m++ });
  return { svc, ls, mudancas: () => m };
}

describe("grade", () => {
  test("empresas do Departamento Cadastro, setores padrão e competência do mês anterior", () => {
    const { svc } = amb();
    assert.equal(svc.mesPadrao(), "2026-09");
    assert.deepEqual(svc.setores().map((s) => s.id), ["contabil", "fiscal", "dp"]);
    const g = svc.grade("2026-09", "dp");
    assert.deepEqual(g.linhas.map((l) => l.empresa.nome), ["Alfa Comércio Ltda", "Beta Serviços ME"]);
    assert.deepEqual(g.linhas[0].celulas.map((c) => c.obrigacao), ["Folha", "FGTS", "DCTFWeb"]);
    assert.equal(g.pct, 0); assert.equal(g.total, 6);
  });
  test("marcar feito e não se aplica; completo e totais por pessoa", () => {
    const { svc } = amb();
    svc.definirResponsavel("dp", "c1", "Ana"); svc.definirResponsavel("dp", "c2", "Bruno");
    ["Folha", "FGTS"].forEach((o) => svc.definirStatus("2026-09", "dp", "c1", o, "feito", "Ana"));
    svc.definirStatus("2026-09", "dp", "c1", "DCTFWeb", "na", "Ana");
    svc.definirStatus("2026-09", "dp", "c2", "Folha", "feito", "Bruno");
    const g = svc.grade("2026-09", "dp");
    assert.equal(g.linhas[0].completo, true); assert.equal(g.linhas[0].total, 2);
    assert.equal(g.linhas[1].completo, false);
    assert.deepEqual(g.porPessoa.map((p) => [p.pessoa, p.feitas, p.total]), [["Ana", 2, 2], ["Bruno", 1, 3]]);
    assert.equal(g.pct, 60);
    assert.equal(svc.grade("2026-09", "dp", { pendentes: true }).linhas.length, 1);
    assert.equal(svc.grade("2026-09", "dp", { pessoa: "bruno" }).linhas.length, 1);
    assert.equal(svc.grade("2026-08", "dp").feitas, 0, "cada mês tem a sua grade");
    svc.definirStatus("2026-09", "dp", "c1", "Folha", "", "Ana");
    assert.equal(svc.grade("2026-09", "dp").linhas[0].completo, false);
    assert.throws(() => svc.definirStatus("2026-09", "dp", "c1", "Folha", "x"), /inválida/);
  });
  test("colunas editáveis, empresa oculta num setor e resumo para o Início", () => {
    const { svc } = amb();
    svc.salvarObrigacoes("dp", ["Folha", " folha ", "eSocial", ""]);
    assert.deepEqual(svc.setores().find((s) => s.id === "dp").obrigacoes, ["Folha", "eSocial"]);
    assert.throws(() => svc.salvarObrigacoes("dp", [" "]), /pelo menos uma/);
    svc.ocultar("dp", "c2", true);
    assert.equal(svc.grade("2026-09", "dp").linhas.length, 1);
    assert.equal(svc.grade("2026-09", "dp").ocultas[0].id, "c2");
    svc.definirResponsavel("fiscal", "c1", "Mauricio Teste");
    const r = svc.resumo("2026-09", { nome: "Mauricio Teste", email: "m@exemplo.com" });
    assert.equal(r.minhas, 3);
    assert.equal(r.total, 2 + 3 * 2 + 3 * 2);
    assert.ok(E.ehMesmaPessoa("mauricio", { nome: "Mauricio Teste" }));
    assert.ok(!E.ehMesmaPessoa("Ana", { nome: "Mauricio Teste" }));
  });
});

describe("passagem de bastão e diário", () => {
  test("passa só as empresas com pendência, devolve e desfaz", () => {
    const { svc } = amb();
    svc.definirResponsavel("dp", "c1", "Ana"); svc.definirResponsavel("dp", "c2", "Ana");
    ["Folha", "FGTS", "DCTFWeb"].forEach((o) => svc.definirStatus("2026-09", "dp", "c1", o, "feito"));
    assert.throws(() => svc.passarBastao("2026-09", "dp", "Ana", "ana"), /diferentes/);
    const r = svc.passarBastao("2026-09", "dp", "Ana", "Carla", "férias");
    assert.equal(r.qtd, 1);
    assert.equal(svc.responsavel("dp", "c2"), "Carla"); assert.equal(svc.responsavel("dp", "c1"), "Ana");
    const b = svc.historicoBastao()[0];
    assert.equal(b.motivo, "férias");
    svc.devolverBastao(b.id);
    assert.equal(svc.responsavel("dp", "c2"), "Ana");
    assert.ok(svc.historicoBastao()[0].devolvido);
    assert.throws(() => svc.passarBastao("2026-09", "dp", "Bruno", "Ana"), /não tem empresas/);
    const r2 = svc.passarBastao("2026-09", "dp", "Ana", "Bruno");
    r2.desfazer();
    assert.equal(svc.responsavel("dp", "c2"), "Ana");
  });
  test("diário por dia, pessoa e setor", () => {
    const { svc } = amb();
    assert.throws(() => svc.anotar("Ana", "dp", " "), /Escreva/);
    svc.anotar("Ana", "dp", "Folhas conferidas", "2026-10-19");
    svc.anotar("Bruno", "fiscal", "Parei na letra G", "2026-10-20");
    svc.anotar("Ana", "dp", "FGTS enviado", "2026-10-20");
    const g = svc.diario();
    assert.deepEqual(g.map((x) => [x.data, x.itens.length]), [["2026-10-20", 2], ["2026-10-19", 1]]);
    assert.equal(svc.diario({ pessoa: "ana" }).reduce((n, x) => n + x.itens.length, 0), 2);
    assert.deepEqual(svc.pessoas(), ["Ana", "Bruno"]);
    svc.excluirAnotacao(g[0].itens[0].id);
    assert.equal(svc.diario()[0].itens.length, 1);
  });
});

describe("importar", () => {
  test("CSV de gestão de entregas: setor, obrigação, responsável, competência e situação", () => {
    const { svc } = amb();
    const cab = ["Obrigação / Tarefa", "Tipo", "Empresa", "EmpID", "CNPJ", "Cidade", "Estado", "Prazo legal", "Prazo Técnico", "Data da dispensa", "Responsável pela dispensa",
      "Data da entrega", "Status", "Departamento", "Responsável prazo", "Responsável entrega", "Competência"];
    const linhas = [cab,
      ["Folha de pagamento", "Obrigação", "ALFA COMERCIO LTDA", "1", "11.111.111/0001-11", "", "", "", "", "", "", "05/10/2026", "Ent. PzTéc.", "Pessoal", "Ana Exemplo", "Ana Exemplo", "09/2026"],
      ["Taxa de alvará (exemplo)", "Obrigação", "Nova Empresa SA", "2", "44.444.444/0001-44", "", "", "", "", "", "", "", "Pendente", "Alvarás", "Bia Exemplo", "", "09/2026"],
      ["Sem competência", "Obrigação", "Nova Empresa SA", "2", "", "", "", "", "", "", "", "", "Pendente", "Fiscal", "", "", ""]];
    const p = svc.lerEntregas(linhas);
    assert.equal(p.itens.length, 2); assert.equal(p.avisos.length, 1);
    assert.deepEqual([p.itens[0].setor, p.itens[0].status, p.itens[0].mes], ["dp", "feito", "2026-09"]);
    const r = svc.aplicarImportacao(p.itens);
    assert.equal(r.empresasNovas, 1, "a Alfa foi achada pelo CNPJ");
    const dp = svc.grade("2026-09", "dp");
    assert.ok(dp.setor.obrigacoes.includes("Folha de pagamento"));
    assert.equal(dp.linhas.find((l) => l.empresa.id === "c1").responsavel, "Ana Exemplo");
    const alv = svc.setores().find((s) => s.nome === "Alvarás");
    assert.ok(alv, "departamento novo vira setor");
    assert.deepEqual(alv.obrigacoes, ["Taxa de alvará (exemplo)"]);
    assert.equal(svc.lerEntregas([["a", "b"]]).erro.length > 0, true);
  });
  test("planilha de controle: obrigações entre CNPJ e Finalizado", () => {
    const { svc } = amb();
    const linhas = [["Cód.", "Empresa", "CNPJ", "Folha", "FGTS", "DCTF", "Finalizado (Status)", "Observações"],
      [1, "Beta Serviços ME", "", "Concluido", "Pendente", "", "Pendente", "falta guia"],
      [2, "Gama Nova Ltda", "55", "Concluido", "Concluido", "Concluido", "Concluido", ""]];
    const p = svc.lerControle(linhas, "dp", "2026-09");
    assert.deepEqual(p.obrigacoes, ["Folha", "FGTS", "DCTF"]);
    const r = svc.aplicarImportacao(p.itens);
    assert.equal(r.empresasNovas, 1);
    const g = svc.grade("2026-09", "dp");
    const beta = g.linhas.find((l) => l.empresa.id === "c2");
    assert.deepEqual(beta.celulas.filter((c) => c.status === "feito").map((c) => c.obrigacao), ["Folha"]);
    assert.equal(beta.obs, "falta guia");
    assert.equal(g.linhas.find((l) => l.empresa.nome === "Gama Nova Ltda").completo, false, "Folha, FGTS e DCTF feitos, mas DCTFWeb (padrão) continua pendente");
    assert.ok(g.setor.obrigacoes.includes("DCTF"));
  });
  test("situações de outros sistemas", () => {
    assert.equal(E.statusDeTexto("Ent. antecipada"), "feito");
    assert.equal(E.statusDeTexto("Concluido"), "feito");
    assert.equal(E.statusDeTexto("Dispensada"), "na");
    assert.equal(E.statusDeTexto("Pendente"), "");
    assert.equal(E.setorDoDepartamento("Departamento Pessoal"), "dp");
    assert.equal(E.setorDoDepartamento("Alvarás"), "");
  });
});

describe("demonstração e limpar", () => {
  test("demonstração só quando vazio; limpar mantém as colunas e desfaz", () => {
    const { svc } = amb();
    assert.ok(svc.carregarDemonstracao());
    assert.ok(svc.grade("2026-09", "dp").feitas > 0);
    assert.equal(svc.carregarDemonstracao(), false);
    svc.salvarObrigacoes("dp", ["Folha"]);
    const desfazer = svc.limpar();
    assert.equal(svc.grade("2026-09", "dp").feitas, 0);
    assert.deepEqual(svc.setores().find((s) => s.id === "dp").obrigacoes, ["Folha"]);
    desfazer();
    assert.ok(svc.grade("2026-09", "dp").feitas > 0);
  });
});
