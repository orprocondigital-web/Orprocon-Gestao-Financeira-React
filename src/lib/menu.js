/*
 * O que aparece no menu (igual à versão anterior): setores, módulos e, dentro da Integração contábil,
 * as contas bancárias, unidades, outras movimentações e cadastros da planilha do mês.
 */
import { Modulos } from "./legado.js";
import { contabil as dados } from "./useContabil.js";
import { nomeDaFonte } from "./contabil.mjs";
import { depCadastro } from "./useDepCadastro.js";

export { MOVIMENTOS, CADASTROS } from "./contabil.mjs";
import { MOVIMENTOS, CADASTROS } from "./contabil.mjs";
const ICONE_MODULO = { "mod-icms": "icms", "mod-ibs-cbs": "ibs", "mod-iss": "iss", "mod-vencimentos": "venc", "mod-em-dia": "emdia", "mod-horas": "horas" };

export const nomeDaConta = nomeDaFonte;

/** Seções do menu para a pessoa logada. pode(area) vem do login. */
export function montarMenu(pode, ehAdmin) {
  const modulos = (secao) => Modulos.LISTA.filter((m) => m.secao === secao && pode(m.id))
    .map((m) => ({ id: m.id, label: m.label, para: "/modulo/" + m.id, icone: ICONE_MODULO[m.id] || "cadastro", descricao: m.descricao }));
  const integracao = pode("integracao");
  const contabil = [];
  if (integracao) {
    const bancos = dados.bancos();
    const unidades = dados.unidades();
    contabil.push({
      id: "master", label: "Integração contábil", para: "/integracao", icone: "master",
      partes: [
        { titulo: "Bancos", itens: bancos.map((b) => ({ id: b.id, label: b.label, grupo: b.bank || "", para: "/conta/" + b.id, icone: "banco", title: nomeDaFonte(b) })), vazio: "Nenhuma conta cadastrada" },
        { titulo: "Unidades", itens: unidades.map((u) => ({ id: u.id, label: u.label, para: "/conta/" + u.id, icone: "unidade" })), vazio: "Criadas ao distribuir por unidade" },
        { titulo: "Outras movimentações", itens: MOVIMENTOS.map((m) => ({ id: m.id, label: m.label, para: "/conta/" + m.id, icone: "mov" })) },
        { titulo: "Cadastros", itens: CADASTROS.map((c) => ({ id: c.id, label: c.label, para: "/cadastro/" + c.id, icone: "cadastro" })) }
      ]
    });
  }
  if (pode("conciliacao")) contabil.push({ id: "conciliacao", label: "Conciliação", para: "/conciliacao", icone: "conciliacao" });
  const secoes = [
    { titulo: "Contábil", itens: contabil },
    { titulo: "Fiscal", itens: modulos("Fiscal") },
    { titulo: "Departamento Pessoal", itens: modulos("Departamento Pessoal") },
    // Departamento Cadastro: o número ao lado é o que venceu ou vence em até 7 dias
    { titulo: "Departamento Cadastro", itens: pode("mod-vencimentos") ? [
      { id: "dep-empresas", label: "Empresas", para: "/departamento-cadastro/empresas", icone: "empresa" },
      { id: "dep-certidoes", label: "Certidões", para: "/departamento-cadastro/certidoes", icone: "certidao", contador: depCadastro.urgentes("certidoes") },
      { id: "dep-alvaras", label: "Alvarás", para: "/departamento-cadastro/alvaras", icone: "alvara", contador: depCadastro.urgentes("alvaras") },
      { id: "dep-faturamentos", label: "Faturamentos", para: "/departamento-cadastro/faturamentos", icone: "faturamento" },
      { id: "dep-demonstrativos", label: "Demonstrativos contábeis", para: "/departamento-cadastro/demonstrativos", icone: "demonstrativo" },
      { id: "dep-importar", label: "Importar e demonstração", para: "/departamento-cadastro/importar", icone: "importar" }
    ] : [] },
    // Em Dia: tela em React (a grade simples); o módulo antigo saiu
    { titulo: "Escritório", itens: modulos("Escritório").concat(pode("mod-em-dia") ? [{ id: "em-dia", label: "Em Dia", para: "/em-dia", icone: "emdia" }] : []) }
  ];
  if (ehAdmin) secoes.push({ titulo: "Administração", itens: [{ id: "usuarios", label: "Usuários", para: "/usuarios", icone: "usuarios" }] });
  return secoes.filter((s) => s.itens.length);
}
