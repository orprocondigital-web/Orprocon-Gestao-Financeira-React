/*
 * O que aparece no menu (igual à versão anterior): setores, módulos e, dentro da Integração contábil,
 * as contas bancárias, unidades, outras movimentações e cadastros da planilha do mês.
 */
import { Modulos } from "./legado.js";
import { lerJson } from "./tema.js";

export const MOVIMENTOS = [
  { id: "mov-dinheiro", label: "Pagamentos em dinheiro" },
  { id: "mov-juros", label: "Juros recebidos" },
  { id: "mov-compras", label: "Digitação de compras" }
];
export const CADASTROS = [
  { id: "cad-clientes", label: "Clientes" }, { id: "cad-fornecedores", label: "Fornecedores" },
  { id: "cad-plano", label: "Plano de contas" }, { id: "cad-custos", label: "Centro de custos" },
  { id: "cad-bancos", label: "Tabela de bancos" }, { id: "cad-unidades", label: "Tabela de unidades" }
];
const ICONE_MODULO = { "mod-icms": "icms", "mod-ibs-cbs": "ibs", "mod-iss": "iss", "mod-vencimentos": "venc", "mod-em-dia": "emdia", "mod-horas": "horas" };

export function nomeDaConta(b) { return b.sheetName || ((b.bank ? b.bank + " " : "") + b.label); }

/** Seções do menu para a pessoa logada. pode(area) vem do login. */
export function montarMenu(pode, ehAdmin) {
  const modulos = (secao) => Modulos.LISTA.filter((m) => m.secao === secao && pode(m.id))
    .map((m) => ({ id: m.id, label: m.label, para: "/modulo/" + m.id, icone: ICONE_MODULO[m.id] || "cadastro", descricao: m.descricao }));
  const integracao = pode("integracao");
  const contabil = [];
  if (integracao) {
    const bancos = lerJson("system_banks", []);
    const unidades = lerJson("system_units", []);
    contabil.push({
      id: "master", label: "Integração contábil", para: "/integracao", icone: "master",
      partes: [
        { titulo: "Bancos", itens: bancos.map((b) => ({ id: b.id, label: b.label, grupo: b.bank || "", para: "/conta/" + b.id, icone: "banco", title: nomeDaConta(b) })), vazio: "Nenhuma conta cadastrada" },
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
    { titulo: "Escritório", itens: modulos("Escritório") }
  ];
  if (ehAdmin) secoes.push({ titulo: "Administração", itens: [{ id: "usuarios", label: "Usuários", para: "/usuarios", icone: "usuarios" }] });
  return secoes.filter((s) => s.itens.length);
}
