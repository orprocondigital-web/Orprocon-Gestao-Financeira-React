/*
 * espelho.mjs — espelho de ponto para imprimir (Controle de horas). Sem tela: recebe o resumo do mês
 * (H.resumoMes) e devolve uma página HTML pronta, uma folha A4 por funcionário, com os horários de cada dia,
 * as horas trabalhadas, as extras por percentual, o noturno, os atrasos, os totais do mês e as assinaturas.
 * Quem imprime é a tela (Horas.jsx), num iframe; "Salvar como PDF" sai do próprio diálogo do navegador.
 * Testado em tests/horasEspelho.test.js.
 */
import R from "./regras.mjs";

const esc = (s) => String(s === null || s === undefined ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const hm = (v) => (v === null || v === undefined || (typeof v === "number" && isNaN(v)) ? "" : R.fmtHora(v));
const dur = (m) => (m ? R.fmt(m) : "");
const tot = (m) => R.fmt(m || 0);

function cnpjFmt(c) {
  const d = String(c || "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return String(c || "");
}

/** Os funcionários que entram: os escolhidos (ids) ou todos com folha no mês. */
export function quemImprime(resumo, ids) {
  const so = Array.isArray(ids) && ids.length ? new Set(ids) : null;
  return resumo.linhas.filter((l) => (so ? so.has(l.func.id) : !!l.folha));
}

/** Os percentuais de hora extra que aparecem no mês (colunas da tabela). Sempre ao menos um, para a coluna existir. */
function percentuais(linhas) {
  const p = {};
  linhas.forEach((l) => Object.keys(l.calc.totais.extras).forEach((k) => { p[k] = 1; }));
  const lista = Object.keys(p).map(Number).sort((a, b) => a - b);
  return lista.length ? lista : [50];
}

function paginaFuncionario(l, resumo, pcts, opcoes) {
  const f = l.func, t = l.calc.totais, emp = resumo.empresa, rg = resumo.regras;
  const linhasDias = l.calc.dias.map((d) => {
    const e = d.entrada || {};
    const folgaSemanal = !d.carga && !d.trabalhado && !e.oc && !d.feriado;
    const oc = [e.oc && e.oc !== "Feriado" ? e.oc : "", d.feriado ? "Feriado: " + d.feriado : e.oc === "Feriado" ? "Feriado" : "", e.obs || ""].filter(Boolean).join(" · ");
    const cls = [d.tipo === "F" || d.tipo === "0" ? "dom" : "", folgaSemanal ? "folga" : ""].filter(Boolean).join(" ");
    return "<tr" + (cls ? ' class="' + cls + '"' : "") + ">" +
      "<td>" + String(d.dia).padStart(2, "0") + "</td><td>" + esc(d.semana) + "</td>" +
      "<td>" + hm(e.e1) + "</td><td>" + hm(e.s1) + "</td><td>" + hm(e.e2) + "</td><td>" + hm(e.s2) + "</td>" +
      '<td class="oc">' + esc(oc) + "</td>" +
      "<td>" + dur(d.trabalhado) + "</td>" +
      pcts.map((p) => "<td>" + dur(d.extras[p]) + "</td>").join("") +
      "<td>" + dur(d.noturnoReduzido) + "</td><td>" + dur(d.atraso) + "</td>" +
      (opcoes.alertas ? '<td class="oc">' + esc(d.alertas.join("; ")) + "</td>" : "") +
      "</tr>";
  }).join("");
  const somaPct = pcts.map((p) => "<td>" + tot(t.extras[p]) + "</td>").join("");
  const resumoTotais = [
    ["Horas trabalhadas", tot(t.trabalhado)],
    ["Carga prevista", tot(t.carga)],
    ...pcts.map((p) => ["Hora extra " + p + "%", tot(t.extras[p])]),
    ["Adicional noturno" + (rg.noturno.reduzida ? " (horas reduzidas)" : ""), tot(t.noturnoReduzido)],
    ["Atrasos e saídas antecipadas", tot(t.atraso)],
    ["Faltas", String(t.faltas || 0)],
    ["Atestados", String(t.atestados || 0)],
    ["Dias trabalhados", String(t.diasTrabalhados || 0)]
  ].concat(t.atrasoCompensado ? [["Atrasos compensados nas extras", tot(t.atrasoCompensado)]] : []);
  const situacao = !l.folha ? "Sem folha recebida" : l.folha.revisada ? "Conferida" : "Ainda não conferida";
  return '<section class="pagina">' +
    '<header><div><h1>Espelho de ponto</h1><div class="mes">' + esc(R.rotuloMes(resumo.mes).replace(/^./, (c) => c.toUpperCase())) + "</div></div>" +
    '<div class="emp"><strong>' + esc(emp.nome) + "</strong>" + (emp.cnpj ? "<span>CNPJ " + esc(cnpjFmt(emp.cnpj)) + "</span>" : "") + "</div></header>" +
    '<div class="func"><div><span>Funcionário</span><strong>' + esc(f.nome) + "</strong></div>" +
    (f.funcao ? "<div><span>Função</span>" + esc(f.funcao) + "</div>" : "") +
    "<div><span>Carga semanal</span>" + esc(cargaTexto(f.carga)) + "</div>" +
    (opcoes.situacao ? "<div><span>Situação</span>" + esc(situacao) + "</div>" : "") + "</div>" +
    "<table><thead><tr><th>Dia</th><th></th><th>Entrada</th><th>Saída int.</th><th>Volta int.</th><th>Saída</th><th>Ocorrência</th><th>Trab.</th>" +
    pcts.map((p) => "<th>HE " + p + "%</th>").join("") + "<th>Not.</th><th>Atraso</th>" + (opcoes.alertas ? "<th>Alertas</th>" : "") + "</tr></thead>" +
    "<tbody>" + linhasDias + "</tbody>" +
    '<tfoot><tr><td colspan="7">Totais do mês</td><td>' + tot(t.trabalhado) + "</td>" + somaPct + "<td>" + tot(t.noturnoReduzido) + "</td><td>" + tot(t.atraso) + "</td>" + (opcoes.alertas ? "<td></td>" : "") + "</tr></tfoot></table>" +
    '<div class="baixo"><table class="totais"><tbody>' + resumoTotais.map((x) => "<tr><td>" + esc(x[0]) + "</td><td>" + esc(x[1]) + "</td></tr>").join("") + "</tbody></table>" +
    '<p class="regras">Tolerância de ' + esc(rg.toleranciaDia) + " min por dia. Noturno das " + esc(R.fmtHora(rg.noturno.inicio)) + " às " + esc(R.fmtHora(rg.noturno.fim)) +
    (rg.compensarAtrasos ? ". Atrasos descontados das horas extras." : ".") + "</p></div>" +
    '<div class="assinaturas"><div><span></span>' + esc(f.nome) + "<br><small>Funcionário</small></div><div><span></span>" + esc(emp.nome) + "<br><small>Empregador</small></div></div>" +
    '<p class="declaracao">Declaro que os horários acima correspondem à minha jornada de trabalho no período.</p>' +
    "</section>";
}

function cargaTexto(c) {
  const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"], t = R.textosDeCarga(c), g = [];
  t.forEach((v, i) => { const u = g[g.length - 1]; if (u && u.v === v) u.fim = DIAS[i]; else g.push({ ini: DIAS[i], fim: DIAS[i], v }); });
  return g.filter((x) => x.v !== "00:00").map((x) => (x.ini === x.fim ? x.ini : x.ini + " a " + x.fim) + " " + x.v).join(", ") || "sem carga";
}

const CSS = `
@page { size: A4 portrait; margin: 10mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 9pt/1.3 Arial, Helvetica, sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pagina { page-break-after: always; break-after: page; }
.pagina:last-child { page-break-after: auto; break-after: auto; }
header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1b273d; padding-bottom: 4px; margin-bottom: 6px; }
h1 { font-size: 14pt; margin: 0; color: #1b273d; }
.mes { font-size: 10pt; }
.emp { text-align: right; } .emp span { display: block; font-size: 8.5pt; color: #444; }
.func { display: flex; flex-wrap: wrap; gap: 4px 18px; margin-bottom: 6px; }
.func span { display: block; font-size: 7.5pt; color: #555; text-transform: uppercase; letter-spacing: .03em; }
table { border-collapse: collapse; width: 100%; }
thead th { background: #1b273d; color: #fff; font-weight: bold; font-size: 7.5pt; padding: 3px 2px; }
td { border-bottom: 1px solid #d8d8d8; padding: 1.6px 3px; text-align: center; white-space: nowrap; }
td.oc { text-align: left; white-space: normal; font-size: 7.5pt; max-width: 52mm; }
tr.dom td { background: #f1f1f1; } tr.folga td { color: #888; }
tfoot td { font-weight: bold; border-top: 1.5px solid #1b273d; border-bottom: none; padding-top: 3px; }
tfoot td:first-child { text-align: right; }
.baixo { display: flex; gap: 14px; align-items: flex-start; margin-top: 8px; }
.totais { width: auto; min-width: 70mm; } .totais td { text-align: left; padding: 1.5px 6px 1.5px 0; } .totais td:last-child { text-align: right; font-weight: bold; }
.regras { font-size: 7.5pt; color: #555; margin: 0; flex: 1; }
.assinaturas { display: flex; gap: 20mm; margin-top: 16mm; }
.assinaturas div { flex: 1; text-align: center; font-size: 8.5pt; }
.assinaturas span { display: block; border-top: 1px solid #111; margin-bottom: 3px; }
.assinaturas small { color: #555; }
.declaracao { font-size: 7.5pt; color: #555; margin-top: 6px; text-align: center; }
`;

/**
 * A página do espelho. opcoes.ids: só esses funcionários (padrão: todos com folha no mês);
 * opcoes.alertas: coluna de alertas (padrão: não, o espelho vai para o cliente assinar);
 * opcoes.situacao: mostrar se a folha foi conferida (padrão: não).
 * → { html, quantos }.
 */
export function espelhoHtml(resumo, opcoes) {
  const o = Object.assign({ ids: null, alertas: false, situacao: false }, opcoes || {});
  const linhas = quemImprime(resumo, o.ids);
  const pcts = percentuais(linhas);
  const titulo = "Espelho de ponto - " + resumo.empresa.nome + " - " + R.rotuloMes(resumo.mes);
  const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(titulo) + "</title><style>" + CSS + "</style></head><body>" +
    linhas.map((l) => paginaFuncionario(l, resumo, pcts, o)).join("") + "</body></html>";
  return { html, quantos: linhas.length };
}

export default { espelhoHtml, quemImprime };
