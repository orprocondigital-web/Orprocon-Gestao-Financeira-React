import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import R from "../lib/horas/regras.mjs";
import H from "../lib/horas/dados.mjs";
import P from "../lib/horas/planilha.mjs";
import { useHoras } from "../lib/useHoras.js";
import { useAuth } from "../lib/auth.jsx";
import { carregarExcelJs, carregarXlsx } from "../lib/leitores.js";
import { useAvisos } from "../componentes/Avisos.jsx";
import Janela from "../componentes/Janela.jsx";
import { Campo, Selo } from "../componentes/contabil/ui.jsx";

/*
 * Controle de horas (DP): folhas de presença dos funcionários dos clientes sem cartão ponto.
 * Gerar a planilha para o cliente, importar a preenchida, conferir, marcar revisada e fechar o mês.
 * Regras em src/lib/horas/ (regras.mjs, dados.mjs, planilha.mjs), testadas em tests/horas.test.js.
 */
const hh = (m) => R.fmt(m || 0);
const sem0 = (m) => (m ? R.fmt(m) : "—");
const mesTitulo = (m) => R.rotuloMes(m).replace(/^./, (c) => c.toUpperCase());
const nomeArquivo = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "_").replace(/^_|_$/g, "").slice(0, 50);
const SITUACAO = { sem: ["neutro", "Sem folha"], importada: ["pendente", "A conferir"], revisada: ["ok", "Revisada"] };
const DIAS_TELA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function baixar(nome, buf) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function resumoCarga(c) {
  const t = R.textosDeCarga(c), grupos = [];
  t.forEach((v, i) => { const u = grupos[grupos.length - 1]; if (u && u.v === v) u.fim = DIAS_TELA[i]; else grupos.push({ ini: DIAS_TELA[i], fim: DIAS_TELA[i], v }); });
  return grupos.filter((g) => g.v !== "00:00").map((g) => (g.ini === g.fim ? g.ini : g.ini + "–" + g.fim) + " " + g.v.replace(/^0/, "")).join(", ") || "sem carga";
}
function lerCarga(textos) {
  const t = textos.map((v) => { const m = R.paraMin(v || "0"); if (m !== null && isNaN(m)) throw new Error("Carga inválida: " + v); return R.fmtHora(m || 0); });
  return R.cargaDeTextos(t);
}
const Num = ({ rotulo, valor, sub, alerta, destaque }) => (
  <div className={"cartao px-4 py-3 " + (destaque ? "border-brand-fill" : alerta ? "border-debit/50" : "")}>
    <div className="text-[12px] text-muted">{rotulo}</div>
    <div className={"text-xl font-semibold tabular-nums " + (alerta ? "text-debit" : "")}>{valor}</div>
    {sub && <div className="text-[12px] text-muted truncate">{sub}</div>}
  </div>
);

function CamposCarga({ valores, aoMudar }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {DIAS_TELA.map((n, i) => (
        <label key={n} className="flex flex-col gap-1 text-center"><span className="text-[11.5px] text-muted">{n}</span>
          <input value={valores[i]} onChange={(e) => aoMudar(valores.map((v, k) => (k === i ? e.target.value : v)))} inputMode="numeric" aria-label={"Carga de " + n} className="h-9 px-1 text-center tabular-nums" /></label>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- janelas
function JanelaEmpresaNova({ aoFechar, aoCriar }) {
  const [svc] = useHoras();
  const [f, setF] = useState({ nome: "", cnpj: "" });
  const [erro, setErro] = useState("");
  const salvar = (ev) => {
    ev.preventDefault();
    try { const e = svc.mudar((s) => H.salvarEmpresa(s, f, Number(svc.mes().slice(0, 4)))); aoCriar(e.id); } catch (err) { setErro(err.message); }
  };
  return (
    <Janela aberta titulo="Nova empresa" aoFechar={aoFechar} largura="max-w-[520px]"
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button><button type="submit" form="form-hemp" className="btn-primario">Cadastrar</button></>}>
      <form id="form-hemp" onSubmit={salvar} className="space-y-3">
        <Campo rotulo="Nome (razão social)" id="hn-nome"><input id="hn-nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} data-foco /></Campo>
        <Campo rotulo="CNPJ" id="hn-cnpj"><input id="hn-cnpj" value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} /></Campo>
        <p className="text-[12.5px] text-muted">Começa com as regras padrão (tolerância de 10 min, extra a 50% em dia útil e 100% em domingo e feriado, noturno das 22h às 5h com hora reduzida) e os feriados nacionais do ano. Ajuste em Regras de cálculo.</p>
        {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
      </form>
    </Janela>
  );
}

function JanelaFuncionario({ emp, func, aoFechar }) {
  const [svc] = useHoras();
  const { aviso } = useAvisos();
  const [f, setF] = useState({ nome: func ? func.nome : "", funcao: func ? func.funcao || "" : "", quadro: func ? func.quadro || "" : "", ativo: func ? func.ativo !== false : true });
  const [carga, setCarga] = useState(R.textosDeCarga(func ? func.carga : emp.cargaPadrao));
  const [erro, setErro] = useState("");
  const salvar = (ev) => {
    ev.preventDefault();
    try {
      const dados = { id: func ? func.id : "", nome: f.nome, funcao: f.funcao, quadro: f.quadro, carga: lerCarga(carga) };
      if (func) dados.ativo = f.ativo;
      svc.mudar((s) => H.salvarFuncionario(H.porId(s.empresas, emp.id), dados));
      aviso("Funcionário salvo."); aoFechar();
    } catch (err) { setErro(err.message); }
  };
  return (
    <Janela aberta titulo={func ? "Editar funcionário" : "Novo funcionário"} aoFechar={aoFechar} largura="max-w-[600px]"
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button><button type="submit" form="form-hfunc" className="btn-primario">Salvar</button></>}>
      <form id="form-hfunc" onSubmit={salvar} className="space-y-3">
        <Campo rotulo="Nome" id="hf-nome"><input id="hf-nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} data-foco /></Campo>
        <Campo rotulo="Função" id="hf-funcao"><input id="hf-funcao" value={f.funcao} onChange={(e) => setF({ ...f, funcao: e.target.value })} /></Campo>
        <Campo rotulo="Quadro de horário (como no Único)" id="hf-quadro"><input id="hf-quadro" value={f.quadro} onChange={(e) => setF({ ...f, quadro: e.target.value })} placeholder="Ex.: Seg a sex 09:00-12:30 e 13:30-18:00; sáb 08:30-12:30" /></Campo>
        <div className="space-y-1.5"><span className="rotulo">Carga horária por dia (horas trabalhadas, sem o intervalo)</span><CamposCarga valores={carga} aoMudar={setCarga} /></div>
        {func && <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Ativo (sai na planilha do cliente)</label>}
        {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
      </form>
    </Janela>
  );
}

function JanelaVarios({ emp, aoFechar }) {
  const [svc] = useHoras();
  const { aviso } = useAvisos();
  const [texto, setTexto] = useState("");
  const salvar = (ev) => {
    ev.preventDefault();
    const r = svc.mudar((s) => H.adicionarVarios(H.porId(s.empresas, emp.id), texto));
    aviso(r.criados + " funcionário(s) cadastrado(s)" + (r.repetidos.length ? "; " + r.repetidos.length + " já existia(m)" : "") + ".");
    aoFechar();
  };
  return (
    <Janela aberta titulo="Adicionar vários funcionários" aoFechar={aoFechar} largura="max-w-[560px]"
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button><button type="submit" form="form-hvarios" className="btn-primario">Adicionar</button></>}>
      <form id="form-hvarios" onSubmit={salvar} className="space-y-2">
        <p className="text-[13px] text-muted">Um por linha. Para incluir a função, use ponto e vírgula: <code>Maria da Silva; Vendedora</code>. Dá para colar uma coluna do Excel.</p>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} aria-label="Lista de funcionários" className="w-full" data-foco />
        <p className="text-[12.5px] text-muted">Entram com a carga padrão da empresa ({resumoCarga(emp.cargaPadrao)}). Ajuste depois quem for diferente.</p>
      </form>
    </Janela>
  );
}

function JanelaGerar({ emp, mes, aoFechar }) {
  const { aviso } = useAvisos();
  const n = H.ativos(emp).length;
  const [branco, setBranco] = useState(n ? 2 : 10);
  const [erro, setErro] = useState("");
  const gerar = async (ev) => {
    ev.preventDefault();
    const nb = Math.round(Number(branco) || 0);
    if (nb < 0 || nb > 300 || (!n && nb < 1)) { setErro(n ? "Use de 0 a 300 abas em branco." : "Use de 1 a 300 abas."); return; }
    try {
      const ExcelJS = await carregarExcelJs();
      const buf = await P.gerar(ExcelJS, emp, H.ativos(emp), mes, { emBranco: nb }).xlsx.writeBuffer();
      baixar("Folha_de_presenca_" + nomeArquivo(emp.nome) + "_" + mes + ".xlsx", buf);
      aviso("Planilha gerada com " + (n + nb) + " aba(s) de funcionário. Envie ao cliente.");
      aoFechar();
    } catch (err) { setErro(err.message || String(err)); }
  };
  return (
    <Janela aberta titulo="Gerar planilha para o cliente" aoFechar={aoFechar} largura="max-w-[520px]"
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button><button type="submit" form="form-hgerar" className="btn-primario">Gerar e baixar</button></>}>
      <form id="form-hgerar" onSubmit={gerar} className="space-y-3 text-[13.5px]">
        <p className="text-muted">{mesTitulo(mes)} · {emp.nome}</p>
        <p>{n ? <>Vai uma aba com o nome de cada funcionário cadastrado (<b>{n}</b>).</> : "Não precisa cadastrar os funcionários: o cliente escreve o nome em cada aba e, quando a planilha voltar, o sistema cadastra sozinho quem ele preencheu."}</p>
        <Campo rotulo={n ? "Abas em branco a mais (para funcionário novo)" : "Quantas abas (uma por funcionário do cliente)"} id="hg-branco">
          <input id="hg-branco" type="number" min={n ? 0 : 1} max={300} value={branco} onChange={(e) => setBranco(e.target.value)} className="w-[120px]" />
        </Campo>
        <p className="text-[12.5px] text-muted">Na dúvida, mande algumas a mais: aba que sobrar em branco é ignorada. Se faltar, o cliente copia uma aba (está explicado na planilha).</p>
        {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
      </form>
    </Janela>
  );
}

// ---------------------------------------------------------------- telas
function TelaMes({ emp, mes, abrir, irPara }) {
  const [svc, versao] = useHoras();
  const { usuario } = useAuth();
  const { aviso, confirmar } = useAvisos();
  const [gerar, setGerar] = useState(false);
  const entrada = useRef(null);
  const r = useMemo(() => H.resumoMes(svc.estado(), emp.id, mes), [svc, emp.id, mes, versao]);   // eslint-disable-line
  const g = r.geral, m = r.registro, fechado = m && m.status === "fechado";
  const extrasTxt = Object.keys(g.extras).sort((a, b) => a - b).map((p) => p + "%: " + hh(g.extras[p])).join(" · ");

  async function importar(arquivo) {
    try {
      const XLSX = await carregarXlsx();
      const lido = P.ler(XLSX, XLSX.read(await arquivo.arrayBuffer(), { type: "array" }));
      if (!lido.folhas.length) { aviso(lido.avisos.join(" ") || "Nenhuma folha encontrada."); return; }
      if (!lido.folhas.some((f) => Object.keys(f.dias || {}).length)) { aviso("As folhas desta planilha estão em branco. Confira se é o arquivo que o cliente devolveu."); return; }
      if (lido.empresa && R.normalizarNome(lido.empresa) !== R.normalizarNome(emp.nome) &&
        !(await confirmar({ titulo: "Empresa diferente", texto: "A planilha é da empresa \"" + lido.empresa + "\", mas você está em \"" + emp.nome + "\". Importar mesmo assim?", botao: "Importar" }))) return;
      const jaTem = lido.folhas.filter((f) => {
        const fn = (f.id && H.porId(emp.funcionarios, f.id)) || emp.funcionarios.find((x) => R.normalizarNome(x.nome) === R.normalizarNome(f.nome));
        return fn && m && m.folhas[fn.id] && Object.keys(f.dias || {}).length;
      }).length;
      if (jaTem && !(await confirmar({ titulo: "Substituir folhas?", texto: jaTem + " funcionário(s) já têm folha em " + R.rotuloMes(mes) + ". A importação substitui essas folhas.", botao: "Substituir" }))) return;
      const res = svc.mudar((s) => H.aplicarImportacao(s, emp.id, mes, lido, { arquivo: arquivo.name, quem: usuario ? usuario.nome : "" }));
      aviso(res.importadas + " folha(s) importada(s)." + (res.criados.length ? " Novo(s) funcionário(s) com a carga padrão: " + res.criados.join(", ") + " (confira a carga)." : "") +
        (res.ignoradas.length ? " Abas ignoradas (sem nome): " + res.ignoradas.join(", ") + "." : "") + (res.emBranco.length ? " Em branco (não mexi): " + res.emBranco.join(", ") + "." : "") +
        (res.avisos.length ? " Avisos: " + res.avisos.join(" · ") : ""));
    } catch (err) { aviso("Não consegui ler a planilha: " + (err.message || err)); }
  }

  async function exportar() {
    try {
      const ExcelJS = await carregarExcelJs();
      const wb = new ExcelJS.Workbook(), azul = "FF1B273D";
      const cab = (ws, cols) => {
        ws.columns = cols.map((c) => ({ header: c[0], key: c[1], width: c[2] }));
        ws.getRow(1).eachCell((c) => { c.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: azul } }; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; });
        ws.getRow(1).height = 30; ws.views = [{ state: "frozen", ySplit: 1 }];
      };
      const t = (min) => (min ? min / 1440 : null);
      const ws = wb.addWorksheet("Resumo");
      const cols = [["Funcionário", "nome", 32], ["Função", "funcao", 18], ["Situação", "sit", 12], ["Dias trabalhados", "dias", 11], ["Horas trabalhadas", "trab", 12]];
      r.pcts.forEach((p) => cols.push(["Hora extra " + p + "%", "he" + p, 12]));
      cols.push(["Adicional noturno", "not", 12], ["Atrasos", "atr", 10], ["Faltas", "fal", 8], ["Atestados", "ates", 9], ["Alertas", "ale", 8]);
      cab(ws, cols);
      r.linhas.filter((l) => l.folha).forEach((l) => {
        const x = l.calc.totais, row = { nome: l.func.nome, funcao: l.func.funcao || "", sit: l.status === "revisada" ? "Revisada" : "A conferir", dias: x.diasTrabalhados,
          trab: t(x.trabalhado), not: t(x.noturnoReduzido), atr: t(x.atraso), fal: x.faltas || null, ates: x.atestados || null, ale: x.alertas || null };
        r.pcts.forEach((p) => { row["he" + p] = t(x.extras[p]); });
        ws.addRow(row);
      });
      ws.eachRow((row, n) => { if (n > 1) row.eachCell({ includeEmpty: true }, (c, col) => { c.font = { name: "Arial", size: 10 }; const k = cols[col - 1][1]; if (k === "trab" || k === "not" || k === "atr" || /^he/.test(k)) { c.numFmt = "[h]:mm"; c.alignment = { horizontal: "center" }; } }); });
      ws.addRow([]);
      ws.addRow(["Empresa: " + emp.nome + " · " + R.rotuloMes(mes) + (fechado ? " · mês fechado" : " · mês aberto") + " · tolerância " + r.regras.toleranciaDia + " min · noturno " + (r.regras.noturno.reduzida ? "em horas reduzidas" : "em horas de relógio")]).getCell(1).font = { name: "Arial", size: 9, italic: true };
      const wd = wb.addWorksheet("Dia a dia");
      const dcols = [["Funcionário", "nome", 28], ["Data", "data", 11], ["Dia", "sem", 6], ["Entrada", "e1", 9], ["Saída int.", "s1", 9], ["Volta int.", "e2", 9], ["Saída", "s2", 9],
        ["Ocorrência", "oc", 12], ["Observação", "obs", 26], ["Trabalhado", "trab", 11], ["Hora extra", "he", 10], ["%", "pct", 8], ["Atraso", "atr", 9], ["Noturno", "not", 9], ["Alertas", "ale", 40]];
      cab(wd, dcols);
      const hm = (v) => (v === null || v === undefined ? "" : R.fmtHora(v));
      r.linhas.filter((l) => l.folha).forEach((l) => l.calc.dias.forEach((d) => {
        const e = d.entrada || {};
        if (!d.trabalhado && !e.oc && !d.alertas.length && !e.obs) return;
        wd.addRow({ nome: l.func.nome, data: new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, d.dia)), sem: d.semana, e1: hm(e.e1), s1: hm(e.s1), e2: hm(e.e2), s2: hm(e.s2),
          oc: e.oc || (d.feriado ? "Feriado: " + d.feriado : ""), obs: e.obs || "", trab: t(d.trabalhado), he: t(d.extra), pct: Object.keys(d.extras).join(" / "), atr: t(d.atraso), not: t(d.noturnoReduzido), ale: d.alertas.join("; ") });
      }));
      wd.eachRow((row, n) => { if (n > 1) row.eachCell({ includeEmpty: true }, (c, col) => { c.font = { name: "Arial", size: 10 }; const k = dcols[col - 1][1]; if (k === "data") c.numFmt = "dd/mm/yyyy"; if (["trab", "he", "atr", "not"].includes(k)) c.numFmt = "[h]:mm"; }); });
      baixar("Horas_" + nomeArquivo(emp.nome) + "_" + mes + ".xlsx", await wb.xlsx.writeBuffer());
    } catch (err) { aviso("Não consegui gerar o resumo: " + (err.message || err)); }
  }

  const fechar = async () => {
    const falta = g.comFolha - g.revisadas;
    if (!(await confirmar({ titulo: "Fechar " + R.rotuloMes(mes) + "?", texto: (falta ? "Atenção: " + falta + " folha(s) ainda não revisada(s). " : "") + "O mês fechado não aceita mudanças e guarda as regras e os feriados de hoje.", botao: "Fechar mês" }))) return;
    svc.mudar((s) => H.fecharMes(s, emp.id, mes, usuario ? usuario.nome : "")); aviso("Mês fechado.");
  };
  const reabrir = async () => {
    if (!(await confirmar({ titulo: "Reabrir o mês?", texto: "O cálculo volta a usar as regras atuais da empresa.", botao: "Reabrir" }))) return;
    svc.mudar((s) => H.reabrirMes(s, emp.id, mes)); aviso("Mês reaberto.");
  };
  const removerExemplo = async () => {
    if (!(await confirmar({ titulo: "Remover o exemplo?", texto: "Sai a empresa de exemplo com os funcionários e folhas fictícios. As empresas que você cadastrou não são mexidas.", botao: "Remover" }))) return;
    svc.mudar((s) => H.removerExemplo(s)); aviso("Exemplo removido.");
  };

  return (
    <div className="space-y-4">
      <input ref={entrada} type="file" hidden accept=".xlsx,.xls" onChange={(e) => { if (e.target.files[0]) importar(e.target.files[0]); e.target.value = ""; }} />
      {emp.exemplo && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-info-soft px-4 py-2.5 text-[13px]">
          <span><strong>Dados de exemplo.</strong> Empresa e funcionários fictícios para conhecer o módulo.</span>
          <button type="button" className="btn-contorno btn-sm" onClick={removerExemplo}>Remover exemplo</button>
        </div>
      )}
      {fechado && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ok-soft px-4 py-2.5 text-[13px]">
          <span><strong>Mês fechado</strong> em {new Date(m.fechadoEm).toLocaleString("pt-BR")}{m.fechadoPor ? " por " + m.fechadoPor : ""}. O cálculo usa as regras e os feriados da data do fechamento.</span>
          <button type="button" className="btn-fantasma btn-sm" onClick={reabrir}>Reabrir mês</button>
        </div>
      )}
      {!H.ativos(emp).length && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-soft px-4 py-2.5 text-[13px]">
          <span><strong>Sem funcionários cadastrados, e tudo bem.</strong> Gere a planilha com abas em branco: o cliente escreve o nome de cada funcionário e, na importação, o sistema cadastra sozinho.</span>
          <button type="button" className="btn-contorno btn-sm" onClick={() => irPara("funcionarios")}>Cadastrar funcionários</button>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <Num rotulo="Folhas recebidas" valor={g.comFolha + " de " + g.funcionarios} sub={R.rotuloMes(mes)} destaque />
        <Num rotulo="Revisadas" valor={g.revisadas + " de " + g.comFolha} sub={g.comFolha && g.revisadas === g.comFolha ? "todas conferidas" : "falta conferir"} />
        <Num rotulo="Alertas" valor={g.alertas} sub="dias para olhar com atenção" alerta={g.alertas > 0} />
        <Num rotulo="Horas extras" valor={hh(g.extra)} sub={extrasTxt || "nenhuma"} />
        <Num rotulo="Adicional noturno" valor={hh(g.noturno)} sub={r.regras.noturno.reduzida ? "em horas reduzidas" : "em horas de relógio"} />
      </div>
      <section className="cartao overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
          <button type="button" className="btn-primario btn-sm" onClick={() => setGerar(true)}>Gerar planilha para o cliente</button>
          <button type="button" className="btn-contorno btn-sm" disabled={fechado} onClick={() => entrada.current.click()}>Importar planilha preenchida</button>
          <div className="flex-1" />
          <button type="button" className="btn-contorno btn-sm" disabled={!g.comFolha} onClick={exportar}>Exportar resumo (Excel)</button>
          {!fechado && <button type="button" className="btn-contorno btn-sm" disabled={!g.comFolha} onClick={fechar}>Fechar mês</button>}
        </div>
        {!r.linhas.length ? <p className="p-8 text-center text-muted text-[13.5px]">Sem funcionários. Cadastre os funcionários ou importe a planilha do cliente.</p> : (
          <div className="overflow-x-auto relative">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-[11.5px] uppercase tracking-wide text-muted">
                <tr><th className="px-3 py-2.5 text-left font-semibold min-w-[200px]">Funcionário</th><th className="px-2 py-2.5 text-left font-semibold">Situação</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Dias</th><th className="px-2 py-2.5 text-right font-semibold">Trabalhadas</th>
                  {r.pcts.map((p) => <th key={p} className="px-2 py-2.5 text-right font-semibold">HE {p}%</th>)}
                  <th className="px-2 py-2.5 text-right font-semibold">Noturno</th><th className="px-2 py-2.5 text-right font-semibold">Atrasos</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Faltas</th><th className="px-2 py-2.5 text-right font-semibold">Alertas</th><th className="px-3 py-2.5" /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.linhas.map((l) => {
                  const t = l.calc.totais, tem = !!l.folha, [tipo, txt] = SITUACAO[l.status];
                  return (
                    <tr key={l.func.id} className="hover:bg-surface-2 cursor-pointer" onClick={() => abrir(l.func.id)}>
                      <td className="px-3 py-2"><strong className="block font-medium">{l.func.nome}</strong><span className="text-[11.5px] text-muted">{l.func.funcao || ""}{l.func.ativo === false ? " · inativo" : ""}</span></td>
                      <td className="px-2 py-2"><Selo tipo={tipo}>{txt}</Selo></td>
                      <td className="px-2 py-2 text-right tabular-nums">{tem ? t.diasTrabalhados : "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tem ? hh(t.trabalhado) : "—"}</td>
                      {r.pcts.map((p) => <td key={p} className="px-2 py-2 text-right tabular-nums">{tem ? sem0(t.extras[p]) : "—"}</td>)}
                      <td className="px-2 py-2 text-right tabular-nums">{tem ? sem0(t.noturnoReduzido) : "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tem ? sem0(t.atraso) : "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tem ? t.faltas || "—" : "—"}</td>
                      <td className="px-2 py-2 text-right">{tem && t.alertas ? <Selo tipo="erro">{t.alertas}</Selo> : <span className="text-muted">—</span>}</td>
                      <td className="px-3 py-2 text-right"><button type="button" className="btn-contorno btn-sm" onClick={(ev) => { ev.stopPropagation(); abrir(l.func.id); }}>{tem ? "Conferir" : "Digitar"}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {gerar && <JanelaGerar emp={emp} mes={mes} aoFechar={() => setGerar(false)} />}
    </div>
  );
}

const CAMPOS = [["e1", "Entrada"], ["s1", "Saída int."], ["e2", "Volta int."], ["s2", "Saída"]];

function Folha({ emp, mes, funcId, abrir, voltar }) {
  const [svc, versao] = useHoras();
  const { aviso } = useAvisos();
  const [editar, setEditar] = useState(false);
  const tabela = useRef(null);
  const f = H.porId(emp.funcionarios, funcId);
  const est = svc.estado(), m = H.mesDe(est, emp.id, mes, false), fechado = m && m.status === "fechado";
  const folha = (m && m.folhas[funcId]) || { dias: {}, revisada: false, avisos: [] };
  const calc = useMemo(() => R.calcularMes(folha, f, mes, H.feriadosDoMes(emp, m), H.regrasDoMes(emp, m)), [versao, funcId, mes]);   // eslint-disable-line
  const lista = H.resumoMes(est, emp.id, mes).linhas.map((l) => l.func.id);
  const i = lista.indexOf(funcId);
  if (!f) return null;

  const gravar = (dia, campo, valor) => {
    try { svc.mudar((s) => H.atualizarDia(s, emp.id, mes, funcId, dia, { [campo]: valor })); return true; } catch (err) { aviso(err.message); return false; }
  };
  const salvarHora = (el) => {
    const dia = Number(el.dataset.dia), campo = el.dataset.campo, atual = (folha.dias[dia] || {})[campo];
    const v = R.paraMin(el.value);
    if (typeof v === "number" && isNaN(v)) { el.classList.add("border-debit"); aviso("Horário não reconhecido: " + el.value + ". Use 09:00 ou 0900."); return false; }
    el.classList.remove("border-debit");
    if (v === (atual === undefined ? null : atual)) { el.value = R.fmtHora(v); return true; }
    return gravar(dia, campo, v);
  };
  const descer = (el) => {
    const n = tabela.current.querySelector('[data-dia="' + (Number(el.dataset.dia) + 1) + '"][data-campo="' + el.dataset.campo + '"]');
    if (n) { n.focus(); if (n.select) n.select(); }
  };
  const revisar = (sim) => {
    try { svc.mudar((s) => H.marcarRevisada(s, emp.id, mes, funcId, sim)); } catch (err) { aviso(err.message); return; }
    if (!sim) return;
    const prox = H.resumoMes(svc.estado(), emp.id, mes).linhas.find((l) => l.status === "importada");
    if (prox) { aviso("Revisada. Próxima folha a conferir."); abrir(prox.func.id); } else { aviso("Revisada. Todas as folhas recebidas foram conferidas."); voltar(); }
  };
  const t = calc.totais;
  const extras = (o) => Object.keys(o).map((p) => hh(o[p]) + " (" + p + "%)").join(" · ");
  return (
    <section className="cartao overflow-hidden">
      <div className="p-4 flex flex-wrap items-start justify-between gap-3 border-b border-line">
        <div className="min-w-0">
          <button type="button" className="text-[13px] text-brand hover:underline" onClick={voltar}>‹ Todas as folhas</button>
          <h2 className="text-[18px] font-semibold">{f.nome}</h2>
          <div className="text-[12.5px] text-muted">{[f.funcao, "Carga: " + resumoCarga(f.carga), f.quadro ? "Quadro: " + f.quadro : ""].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {i > 0 && <button type="button" className="btn-fantasma btn-sm" onClick={() => abrir(lista[i - 1])}>‹ Anterior</button>}
          {i < lista.length - 1 && <button type="button" className="btn-fantasma btn-sm" onClick={() => abrir(lista[i + 1])}>Próximo ›</button>}
          <button type="button" className="btn-contorno btn-sm" onClick={() => setEditar(true)}>Carga e cadastro</button>
          {!fechado && (folha.revisada ? <button type="button" className="btn-fantasma btn-sm" onClick={() => revisar(false)}>Desmarcar revisão</button>
            : <button type="button" className="btn-primario btn-sm" onClick={() => revisar(true)}>Marcar como revisada</button>)}
        </div>
      </div>
      {(folha.avisos || []).length > 0 && <div className="mx-4 mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[13px]"><strong>Na importação:</strong><ul className="list-disc pl-5">{folha.avisos.map((a) => <li key={a}>{a}</li>)}</ul></div>}
      {folha.revisada && <p className="mx-4 mt-3 rounded-lg bg-ok-soft px-3 py-2 text-[13px]">Folha revisada. Se mudar algum horário, ela volta para “a conferir”.</p>}
      <div className="overflow-x-auto relative mt-3">
        <table ref={tabela} className="w-full text-[13px]">
          <thead className="bg-surface-2 text-[11.5px] uppercase tracking-wide text-muted">
            <tr><th className="px-3 py-2 text-left font-semibold">Dia</th><th className="px-1 py-2 text-left font-semibold">Sem.</th>
              {CAMPOS.map(([k, n]) => <th key={k} className="px-1 py-2 text-center font-semibold">{n}</th>)}
              <th className="px-1 py-2 text-left font-semibold">Ocorrência</th><th className="px-1 py-2 text-left font-semibold">Observação</th>
              <th className="px-2 py-2 text-right font-semibold">Trabalhado</th><th className="px-2 py-2 text-right font-semibold">Extra</th>
              <th className="px-2 py-2 text-right font-semibold">Atraso</th><th className="px-2 py-2 text-right font-semibold">Noturno</th><th className="px-3 py-2 text-left font-semibold min-w-[160px]">Alertas</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {calc.dias.map((d) => {
              const e = d.entrada || {}, fds = d.semana === "Sáb" || d.semana === "Dom";
              return (
                <tr key={d.dia} className={d.alertas.length ? "bg-warn-soft/40" : d.feriado ? "bg-info-soft/40" : fds ? "bg-surface-2/60" : ""}>
                  <td className="px-3 py-1 whitespace-nowrap">{String(d.dia).padStart(2, "0")}{d.feriado && <span className="block text-[11px] text-info">{d.feriado}</span>}</td>
                  <td className="px-1 py-1">{d.semana}</td>
                  {CAMPOS.map(([k]) => (
                    <td key={k} className="px-1 py-1">
                      <input key={k + d.dia + String(e[k])} defaultValue={R.fmtHora(e[k])} disabled={fechado} data-dia={d.dia} data-campo={k} inputMode="numeric"
                        aria-label={k + " do dia " + d.dia} className="h-8 w-[66px] px-1 text-center tabular-nums text-[13px]"
                        onBlur={(ev) => salvarHora(ev.target)} onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); if (salvarHora(ev.target) !== false) descer(ev.target); } }} />
                    </td>
                  ))}
                  <td className="px-1 py-1">
                    <select value={e.oc || ""} disabled={fechado} onChange={(ev) => gravar(d.dia, "oc", ev.target.value)} aria-label={"Ocorrência do dia " + d.dia} className="h-8 text-[13px] w-[104px]">
                      <option value="" />{R.OCORRENCIAS.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <input key={"obs" + d.dia + (e.obs || "")} defaultValue={e.obs || ""} disabled={fechado} aria-label={"Observação do dia " + d.dia} className="h-8 w-[120px] text-[13px]"
                      onBlur={(ev) => { if (ev.target.value.trim() !== (e.obs || "")) gravar(d.dia, "obs", ev.target.value.trim()); }} onKeyDown={(ev) => { if (ev.key === "Enter") ev.target.blur(); }} />
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{d.trabalhado ? hh(d.trabalhado) : ""}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-credit whitespace-nowrap">{d.extra ? extras(d.extras) : ""}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-debit">{d.atraso ? hh(d.atraso) : d.falta ? "falta" : ""}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{d.noturnoReduzido ? hh(d.noturnoReduzido) : ""}</td>
                  <td className="px-3 py-1 text-[12px] text-warn font-medium">{d.alertas.join("; ")}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-surface-2 font-semibold"><tr>
            <td colSpan={8} className="px-3 py-2 text-right">Totais do mês</td>
            <td className="px-2 py-2 text-right tabular-nums">{hh(t.trabalhado)}</td>
            <td className="px-2 py-2 text-right tabular-nums text-credit">{extras(t.extras) || "—"}</td>
            <td className="px-2 py-2 text-right tabular-nums text-debit">{t.atraso ? hh(t.atraso) : "—"}{t.faltas ? " · " + t.faltas + " falta(s)" : ""}</td>
            <td className="px-2 py-2 text-right tabular-nums">{t.noturnoReduzido ? hh(t.noturnoReduzido) : "—"}</td>
            <td className="px-3 py-2">{t.alertas ? t.alertas + " alerta(s)" : ""}</td>
          </tr></tfoot>
        </table>
      </div>
      <p className="px-4 py-3 text-[12.5px] text-muted">Digite os horários como quiser (0900, 9:00 ou 9h) e tecle Enter para ir ao dia seguinte. {t.atrasoCompensado ? "Atrasos compensados com horas extras: " + hh(t.atrasoCompensado) + ". " : ""}Os cálculos usam as regras de cálculo da empresa.</p>
      {editar && <JanelaFuncionario emp={emp} func={f} aoFechar={() => setEditar(false)} />}
    </section>
  );
}

function Funcionarios({ emp }) {
  const [janela, setJanela] = useState(null);
  const [inativos, setInativos] = useState(false);
  const lista = emp.funcionarios.filter((f) => inativos || f.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const nInativos = emp.funcionarios.filter((f) => f.ativo === false).length;
  return (
    <section className="cartao overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line">
        <div className="flex-1 min-w-[220px]"><h2 className="text-[16px] font-semibold">Funcionários de {emp.nome}</h2>
          <p className="text-[12.5px] text-muted">{H.ativos(emp).length} ativo(s). A planilha do cliente sai com uma aba para cada funcionário ativo.</p></div>
        {nInativos > 0 && <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} /> Mostrar os {nInativos} inativo(s)</label>}
        <button type="button" className="btn-contorno btn-sm" onClick={() => setJanela({ varios: true })}>Adicionar vários</button>
        <button type="button" className="btn-primario btn-sm" onClick={() => setJanela({ func: null })}>Novo funcionário</button>
      </div>
      {!lista.length ? <p className="p-8 text-center text-muted text-[13.5px]">Nenhum funcionário. Cadastre um a um, cole uma lista em “Adicionar vários”, ou importe a planilha do cliente.</p> : (
        <div className="overflow-x-auto relative">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 text-[11.5px] uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5 text-left font-semibold">Funcionário</th><th className="px-2 py-2.5 text-left font-semibold">Carga horária</th><th className="px-2 py-2.5 text-left font-semibold">Quadro de horário</th><th className="px-2 py-2.5 text-left font-semibold">Situação</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody className="divide-y divide-line">
              {lista.map((f) => (
                <tr key={f.id}>
                  <td className="px-4 py-2"><strong className="block font-medium">{f.nome}</strong><span className="text-[11.5px] text-muted">{f.funcao || ""}</span></td>
                  <td className="px-2 py-2">{resumoCarga(f.carga)}</td>
                  <td className="px-2 py-2 text-[12.5px] text-ink-2">{f.quadro || "—"}</td>
                  <td className="px-2 py-2">{f.ativo === false ? <Selo tipo="neutro">Inativo</Selo> : <Selo tipo="ok">Ativo</Selo>}</td>
                  <td className="px-4 py-2 text-right"><button type="button" className="btn-contorno btn-sm" onClick={() => setJanela({ func: f })}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {janela && (janela.varios ? <JanelaVarios emp={emp} aoFechar={() => setJanela(null)} /> : <JanelaFuncionario emp={emp} func={janela.func} aoFechar={() => setJanela(null)} />)}
    </section>
  );
}

function Regras({ emp, aoExcluir }) {
  const [svc] = useHoras();
  const { aviso, confirmar } = useAvisos();
  const [dados, setDados] = useState({ nome: emp.nome, cnpj: emp.cnpj || "" });
  const [cargaPad, setCargaPad] = useState(R.textosDeCarga(emp.cargaPadrao));
  const inicial = () => { const rg = emp.regras; return {
    tol: String(rg.toleranciaDia), comp: !!rg.compensarAtrasos,
    he: Object.fromEntries(R.TIPOS.map((t) => [t.id, { ate: R.fmtHora(rg.he[t.id].ate), pct1: String(rg.he[t.id].pct1), pct2: String(rg.he[t.id].pct2) }])),
    ni: R.fmtHora(rg.noturno.inicio), nf: R.fmtHora(rg.noturno.fim), np: String(rg.noturno.pct), red: !!rg.noturno.reduzida,
    int: String(rg.intervaloMinimo), lim: R.fmtHora(rg.limiteExtraDia), inter: R.fmtHora(rg.interjornada) }; };
  const [f, setF] = useState(inicial);
  useEffect(() => { setF(inicial()); setDados({ nome: emp.nome, cnpj: emp.cnpj || "" }); setCargaPad(R.textosDeCarga(emp.cargaPadrao)); }, [emp.id]);   // eslint-disable-line
  const [erro, setErro] = useState("");
  const hora = (v, rot) => { const m = R.paraMin(v); if (m === null || isNaN(m)) throw new Error(rot + ": use o formato 00:00."); return m; };
  const salvarEmpresa = (ev) => {
    ev.preventDefault();
    try { svc.mudar((s) => H.salvarEmpresa(s, { id: emp.id, nome: dados.nome, cnpj: dados.cnpj, cargaPadrao: lerCarga(cargaPad) })); aviso("Dados da empresa salvos."); } catch (err) { aviso(err.message); }
  };
  const salvarRegras = (ev) => {
    ev.preventDefault(); setErro("");
    try {
      const rg = R.completarRegras(emp.regras);
      rg.toleranciaDia = Math.max(0, Number(f.tol) || 0);
      rg.compensarAtrasos = f.comp;
      R.TIPOS.forEach((t) => {
        let ate = R.paraMin(f.he[t.id].ate || "0"); if (ate === null) ate = 0;
        if (isNaN(ate)) throw new Error(t.nome + ": horas da 1ª faixa no formato 02:00.");
        rg.he[t.id] = { ate, pct1: Number(f.he[t.id].pct1) || 0, pct2: Number(f.he[t.id].pct2) || 0 };
      });
      rg.noturno = { inicio: hora(f.ni, "Início do noturno"), fim: hora(f.nf, "Fim do noturno"), pct: Number(f.np) || 0, reduzida: f.red };
      rg.intervaloMinimo = Math.max(0, Number(f.int) || 0);
      rg.limiteExtraDia = hora(f.lim, "Hora extra máxima");
      rg.interjornada = hora(f.inter, "Descanso entre jornadas");
      svc.mudar((s) => { H.porId(s.empresas, emp.id).regras = rg; });
      aviso("Regras salvas. Os meses abertos já foram recalculados.");
    } catch (err) { setErro(err.message); }
  };
  const padrao = async () => {
    if (!(await confirmar({ titulo: "Voltar ao padrão?", texto: "Todas as regras desta empresa voltam ao padrão.", botao: "Voltar ao padrão" }))) return;
    svc.mudar((s) => { H.porId(s.empresas, emp.id).regras = R.regrasPadrao(); }); setF(inicial()); aviso("Regras no padrão.");
  };
  const excluir = async () => {
    if (!(await confirmar({ titulo: "Excluir " + emp.nome + "?", texto: "Saem todos os funcionários e folhas desta empresa. Não dá para desfazer.", botao: "Excluir", perigo: true }))) return;
    svc.mudar((s) => H.excluirEmpresa(s, emp.id)); aviso("Empresa excluída."); aoExcluir();
  };
  const limparTudo = async () => {
    if (!(await confirmar({ titulo: "Apagar tudo do Controle de horas?", texto: svc.estado().empresas.length + " empresa(s), funcionários, folhas e meses fechados. Não dá para desfazer.", botao: "Apagar tudo", perigo: true }))) return;
    svc.mudar((s) => H.limparTudo(s)); aviso("Controle de horas zerado."); aoExcluir();
  };
  const muda = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const mudaHe = (id, k, v) => setF((x) => ({ ...x, he: { ...x.he, [id]: { ...x.he[id], [k]: v } } }));
  return (
    <div className="space-y-4">
      <form onSubmit={salvarEmpresa} className="cartao p-5 space-y-3">
        <h2 className="text-[16px] font-semibold">Dados da empresa</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Campo rotulo="Nome" id="he-nome"><input id="he-nome" value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} /></Campo>
          <Campo rotulo="CNPJ" id="he-cnpj"><input id="he-cnpj" value={dados.cnpj} onChange={(e) => setDados({ ...dados, cnpj: e.target.value })} /></Campo>
        </div>
        <div className="space-y-1.5 max-w-[560px]"><span className="rotulo">Carga padrão para funcionário novo</span><CamposCarga valores={cargaPad} aoMudar={setCargaPad} /></div>
        <div className="flex justify-between gap-2"><button type="button" className="btn-fantasma btn-sm text-debit" onClick={excluir}>Excluir empresa</button><button type="submit" className="btn-primario btn-sm">Salvar dados</button></div>
      </form>
      <form onSubmit={salvarRegras} className="cartao p-5 space-y-5">
        <div><h2 className="text-[16px] font-semibold">Regras de cálculo</h2><p className="text-[12.5px] text-muted">Valem para esta empresa. Mês já fechado continua com as regras da data do fechamento.</p></div>
        <div className="flex flex-wrap items-end gap-4">
          <Campo rotulo="Tolerância por dia (minutos)" id="hr-tol" dica="Diferença até este limite não conta como extra nem atraso (CLT: 10 min)."><input id="hr-tol" type="number" min={0} max={60} value={f.tol} onChange={(e) => muda("tol", e.target.value)} className="w-[120px]" /></Campo>
          <label className="flex items-center gap-2 text-[13.5px] pb-6"><input type="checkbox" checked={f.comp} onChange={(e) => muda("comp", e.target.checked)} /> Descontar os atrasos do mês das horas extras</label>
        </div>
        <div className="space-y-2">
          <h3 className="text-[14px] font-semibold">Hora extra</h3>
          <div className="overflow-x-auto"><table className="text-[13px]">
            <thead className="text-[11.5px] uppercase tracking-wide text-muted"><tr><th className="pr-4 py-1 text-left">Dia</th><th className="px-2 py-1 text-left">As primeiras (horas)</th><th className="px-2 py-1 text-left">a (%)</th><th className="px-2 py-1 text-left">As demais a (%)</th></tr></thead>
            <tbody>{R.TIPOS.map((t) => (
              <tr key={t.id}><td className="pr-4 py-1 font-semibold">{t.nome}</td>
                <td className="px-2 py-1"><input value={f.he[t.id].ate} onChange={(e) => mudaHe(t.id, "ate", e.target.value)} aria-label={"Primeiras horas de " + t.nome} className="h-8 w-[80px] text-center" /></td>
                <td className="px-2 py-1"><input type="number" min={0} max={300} value={f.he[t.id].pct1} onChange={(e) => mudaHe(t.id, "pct1", e.target.value)} aria-label={"Percentual 1 de " + t.nome} className="h-8 w-[80px]" /></td>
                <td className="px-2 py-1"><input type="number" min={0} max={300} value={f.he[t.id].pct2} onChange={(e) => mudaHe(t.id, "pct2", e.target.value)} aria-label={"Percentual 2 de " + t.nome} className="h-8 w-[80px]" /></td></tr>
            ))}</tbody>
          </table></div>
          <p className="text-[12px] text-muted">Ex.: as primeiras 02:00 a 50%, as demais a 100%. Para um percentual só, use o mesmo nas duas colunas. Domingo e feriado: todo o trabalho do dia é extra quando a carga do dia é zero.</p>
        </div>
        <div className="space-y-2">
          <h3 className="text-[14px] font-semibold">Adicional noturno</h3>
          <div className="flex flex-wrap items-end gap-4">
            <Campo rotulo="Começa às" id="hr-ni"><input id="hr-ni" value={f.ni} onChange={(e) => muda("ni", e.target.value)} className="w-[100px]" /></Campo>
            <Campo rotulo="Termina às" id="hr-nf"><input id="hr-nf" value={f.nf} onChange={(e) => muda("nf", e.target.value)} className="w-[100px]" /></Campo>
            <Campo rotulo="Percentual (%)" id="hr-np"><input id="hr-np" type="number" min={0} max={300} value={f.np} onChange={(e) => muda("np", e.target.value)} className="w-[100px]" /></Campo>
            <label className="flex items-center gap-2 text-[13.5px] pb-2"><input type="checkbox" checked={f.red} onChange={(e) => muda("red", e.target.checked)} /> Hora noturna reduzida (52min30s)</label>
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-[14px] font-semibold">Alertas da conferência</h3>
          <div className="flex flex-wrap items-start gap-4">
            <Campo rotulo="Intervalo mínimo (min)" id="hr-int" dica="Para jornada acima de 6h."><input id="hr-int" type="number" min={0} value={f.int} onChange={(e) => muda("int", e.target.value)} className="w-[120px]" /></Campo>
            <Campo rotulo="Hora extra máxima por dia" id="hr-lim"><input id="hr-lim" value={f.lim} onChange={(e) => muda("lim", e.target.value)} className="w-[120px]" /></Campo>
            <Campo rotulo="Descanso mínimo entre jornadas" id="hr-inter"><input id="hr-inter" value={f.inter} onChange={(e) => muda("inter", e.target.value)} className="w-[120px]" /></Campo>
          </div>
        </div>
        {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
        <div className="flex justify-between gap-2"><button type="button" className="btn-fantasma btn-sm" onClick={padrao}>Voltar ao padrão</button><button type="submit" className="btn-primario btn-sm">Salvar regras</button></div>
      </form>
      <section className="cartao p-5 space-y-2">
        <h2 className="text-[16px] font-semibold">Começar do zero</h2>
        <p className="text-[12.5px] text-muted">Para os testes: apagar tudo deste módulo. Não mexe nos outros módulos.</p>
        <button type="button" className="btn-fantasma btn-sm text-debit" onClick={limparTudo}>Apagar tudo do Controle de horas</button>
      </section>
    </div>
  );
}

function Feriados({ emp, mes }) {
  const [svc] = useHoras();
  const { aviso } = useAvisos();
  const ano = Number(mes.slice(0, 4));
  const [novo, setNovo] = useState({ data: "", nome: "" });
  const lista = emp.feriados.filter((f) => f.data.slice(0, 4) === String(ano)).sort((a, b) => a.data.localeCompare(b.data));
  const doEmp = (s) => H.porId(s.empresas, emp.id);
  const nacionais = () => {
    let n = 0;
    svc.mudar((s) => { const e = doEmp(s); const novos = R.feriadosNacionais(ano).filter((f) => !e.feriados.some((x) => x.data === f.data)); n = novos.length; e.feriados = e.feriados.concat(novos); });
    aviso(n ? n + " feriado(s) nacional(is) adicionado(s)." : "Os feriados nacionais já estavam na lista.");
  };
  const adicionar = (ev) => {
    ev.preventDefault();
    if (!novo.data || !novo.nome.trim()) { aviso("Informe a data e o nome."); return; }
    svc.mudar((s) => { const e = doEmp(s); e.feriados = e.feriados.filter((f) => f.data !== novo.data).concat([{ data: novo.data, nome: novo.nome.trim() }]); });
    setNovo({ data: "", nome: "" }); aviso("Feriado adicionado.");
  };
  return (
    <section className="cartao overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line">
        <div className="flex-1 min-w-[220px]"><h2 className="text-[16px] font-semibold">Feriados de {ano}</h2>
          <p className="text-[12.5px] text-muted">Dia de feriado usa a regra de hora extra “Feriado”. Acrescente os municipais da cidade do cliente.</p></div>
        <button type="button" className="btn-contorno btn-sm" onClick={nacionais}>Adicionar nacionais de {ano}</button>
      </div>
      <form onSubmit={adicionar} className="flex flex-wrap items-end gap-3 p-4 border-b border-line">
        <Campo rotulo="Data" id="hfe-data"><input id="hfe-data" type="date" value={novo.data} onChange={(e) => setNovo({ ...novo, data: e.target.value })} /></Campo>
        <Campo rotulo="Nome" id="hfe-nome" className="flex-1 min-w-[200px]"><input id="hfe-nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Ex.: Aniversário da cidade" /></Campo>
        <button type="submit" className="btn-primario btn-sm">Adicionar</button>
      </form>
      {!lista.length ? <p className="p-8 text-center text-muted text-[13.5px]">Nenhum feriado em {ano}. Use “Adicionar nacionais” e depois acrescente os municipais.</p> : (
        <table className="w-full text-[13px]">
          <thead className="bg-surface-2 text-[11.5px] uppercase tracking-wide text-muted"><tr><th className="px-4 py-2 text-left font-semibold">Data</th><th className="px-2 py-2 text-left font-semibold">Dia</th><th className="px-2 py-2 text-left font-semibold">Feriado</th><th className="px-4 py-2" /></tr></thead>
          <tbody className="divide-y divide-line">
            {lista.map((f) => (
              <tr key={f.data}><td className="px-4 py-2 tabular-nums">{f.data.split("-").reverse().join("/")}</td><td className="px-2 py-2">{R.DIAS[R.diaSemana(f.data)]}</td><td className="px-2 py-2">{f.nome}</td>
                <td className="px-4 py-2 text-right"><button type="button" className="btn-fantasma btn-sm" onClick={() => svc.mudar((s) => { const e = doEmp(s); e.feriados = e.feriados.filter((x) => x.data !== f.data); })}>Remover</button></td></tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const ABAS = [["mes", "Folhas do mês"], ["funcionarios", "Funcionários"], ["regras", "Regras de cálculo"], ["feriados", "Feriados"]];

export default function Horas() {
  const [svc, versao] = useHoras();
  const { aviso } = useAvisos();
  const local = useLocation();
  const [aba, setAba] = useState("mes");
  const [folha, setFolha] = useState(null);
  const [nova, setNova] = useState(false);
  // vindo do Início: empresa e mês escolhidos
  useEffect(() => {
    const p = local.state && local.state.prefs;
    if (p && p["horas:empresa"]) svc.definirEmpresa(p["horas:empresa"]);
    if (p && p["horas:mes"]) svc.definirMes(p["horas:mes"]);
  }, [local.key]);   // eslint-disable-line
  const empresas = svc.empresas();
  const empId = svc.empresaId();
  const emp = H.porId(svc.estado().empresas, empId);
  const mes = svc.mes();
  void versao;
  const irMes = (m) => { svc.definirMes(m); setFolha(null); };
  const exemplo = () => {
    const r = svc.mudar((s) => H.exemplo(s));
    svc.definirEmpresa(r.empresa.id); svc.definirMes(r.mes); setAba("mes"); setFolha(null);
    aviso("Exemplo carregado: empresa e funcionários fictícios.");
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={emp ? emp.id : ""} aria-label="Empresa" className="h-9 w-auto max-w-[340px]"
          onChange={(e) => { if (e.target.value === "__nova") { setNova(true); return; } svc.definirEmpresa(e.target.value); setFolha(null); }}>
          {!empresas.length && <option value="">Nenhuma empresa</option>}
          {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          <option value="__nova">+ Nova empresa…</option>
        </select>
        <div className="inline-flex items-center rounded-lg border border-line bg-surface">
          <button type="button" className="btn-fantasma h-9 w-9 p-0" onClick={() => irMes(R.somarMes(mes, -1))} aria-label="Mês anterior">‹</button>
          <span className="px-2 text-[14px] font-semibold min-w-[150px] text-center">{mesTitulo(mes)}</span>
          <button type="button" className="btn-fantasma h-9 w-9 p-0" onClick={() => irMes(R.somarMes(mes, 1))} aria-label="Mês seguinte">›</button>
        </div>
        {emp && (
          <div className="inline-flex flex-wrap rounded-lg border border-line bg-surface p-0.5" role="tablist">
            {ABAS.map(([id, nome]) => (
              <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => { setAba(id); setFolha(null); }}
                className={"rounded-md px-3 py-1.5 text-[13px] " + (aba === id ? "bg-brand-soft text-brand font-semibold" : "text-ink-2")}>{nome}</button>
            ))}
          </div>
        )}
      </div>
      {!emp ? (
        <section className="cartao p-10 text-center space-y-3">
          <strong className="block text-[15px]">Nenhuma empresa cadastrada</strong>
          <span className="block text-[13.5px] text-muted">Cadastre o cliente e os funcionários dele, gere a planilha de presença e importe quando ela voltar preenchida.</span>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-primario btn-sm" onClick={() => setNova(true)}>Cadastrar empresa</button>
            <button type="button" className="btn-contorno btn-sm" onClick={exemplo}>Ver com dados de exemplo</button>
          </div>
        </section>
      ) : aba === "funcionarios" ? <Funcionarios emp={emp} />
        : aba === "regras" ? <Regras emp={emp} aoExcluir={() => { setAba("mes"); setFolha(null); }} />
        : aba === "feriados" ? <Feriados emp={emp} mes={mes} />
        : folha && H.porId(emp.funcionarios, folha) ? <Folha emp={emp} mes={mes} funcId={folha} abrir={(id) => { setFolha(id); window.scrollTo(0, 0); }} voltar={() => setFolha(null)} />
        : <TelaMes emp={emp} mes={mes} abrir={(id) => { setFolha(id); window.scrollTo(0, 0); }} irPara={setAba} />}
      {nova && <JanelaEmpresaNova aoFechar={() => setNova(false)} aoCriar={(id) => { svc.definirEmpresa(id); setNova(false); setAba("mes"); setFolha(null); aviso("Empresa cadastrada. Já pode gerar a planilha para o cliente."); }} />}
    </div>
  );
}
