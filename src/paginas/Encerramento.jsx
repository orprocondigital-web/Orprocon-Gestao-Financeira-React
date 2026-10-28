import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AuthCore, Core } from "../lib/legado.js";
import { REGIMES } from "../lib/depCadastro.mjs";
import { CAMPOS, ratear } from "../lib/encerramento.mjs";
import { calcular as calcularDist } from "../lib/lucros.mjs";
import { useEncerramento } from "../lib/useEncerramento.js";
import { useLucros } from "../lib/useLucros.js";
import { useAuth } from "../lib/auth.jsx";
import { carregarXlsx } from "../lib/leitores.js";
import { useAvisos } from "../componentes/Avisos.jsx";
import Icone from "../componentes/Icone.jsx";
import { Selo, dataBR } from "../componentes/contabil/ui.jsx";
import { FormDistribuicao } from "./Lucros.jsx";
import Janela from "../componentes/Janela.jsx";

/*
 * Encerramento contábil do exercício: estoque, compras, receita, CMV e lucro bruto por unidade,
 * a matriz com as filiais e o consolidado, os sócios com o distribuído no ano.
 * Regras em src/lib/encerramento.mjs; distribuições em src/lib/lucros.mjs.
 */
const R$ = (v) => (v === null || v === undefined ? "—" : Core.formatBR(v));
const lerNum = (t) => { const s = String(t || "").trim(); if (!s) return null; const n = Core.parseValor(s); return isNaN(n) ? NaN : n; };
const CMP = { estoqueInicial: "EI", compras: "Compras", estoqueFinal: "EF", receitaBruta: "Receita bruta", resultadoAntesEstoque: "Resultado antes do estoque", resultadoPeriodo: "Resultado do período" };

/** Valor editável na própria tabela; vazio = não informado. */
function CampoNum({ valor, aoGravar, rotulo, placeholder, travado }) {
  const fmt = (v) => (v === null || v === undefined ? "" : Core.formatBR(v));
  const [t, setT] = useState(fmt(valor));
  useEffect(() => { setT(fmt(valor)); }, [valor]);
  if (travado) return <span className="block px-2 text-right tabular-nums">{valor === null || valor === undefined ? <span className="text-muted">—</span> : fmt(valor)}</span>;
  return <input value={t} onChange={(e) => setT(e.target.value)} aria-label={rotulo} inputMode="decimal" placeholder={placeholder || "0,00"}
    onBlur={() => { const v = lerNum(t); if (v !== (valor === undefined ? null : valor)) aoGravar(v); }}
    onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { setT(fmt(valor)); e.target.blur(); } }}
    className="h-8 w-full min-w-[104px] px-2 text-right tabular-nums text-[13px] border-transparent bg-transparent hover:border-line focus:bg-surface placeholder:text-muted/70" />;
}

/**
 * Rateio por faturamento (do sistema do Depto. Contábil): o valor a distribuir é dividido entre os sócios na proporção
 * do faturamento que cada um gerou. Grava uma distribuição por sócio em 31/12, com o IRRF de 10% quando passa do limite do mês.
 */
function RateioFaturamento({ g, ano, sugestao, aoFechar }) {
  const [luc] = useLucros();
  const { aviso, confirmar } = useAvisos();
  const socios = g.matriz.socios || [];
  const data = ano + "-12-31";
  const fmt = (v) => (v ? Core.formatBR(v) : "");
  const [total, setTotal] = useState("");
  const [fats, setFats] = useState(() => socios.map(() => ""));
  const [ret, setRet] = useState(() => socios.map(() => null));   // null = segue a sugestão
  const [gravando, setGravando] = useState(false);
  const num = (t) => { const n = lerNum(t); return n === null || Number.isNaN(n) ? 0 : Math.abs(n); };
  const r = ratear(num(total), fats.map(num));
  const linhas = socios.map((s, i) => {
    const valor = r.linhas[i].valor;
    const sug = valor ? luc.sugerirRetencao(g.matriz.id, s.nome, data, valor) : { reter: false };
    const reter = ret[i] === null ? sug.reter : ret[i];
    return Object.assign({ socio: s.nome, participacao: s.percentual, sugere: sug.reter, reter }, r.linhas[i], calcularDist(valor, "bruto", reter));
  });
  const soma = (k) => linhas.reduce((t, l) => t + (l[k] || 0), 0);
  const mudaFat = (i, v) => setFats((x) => x.map((y, k) => (k === i ? v : y)));
  const pelaParticipacao = () => setFats(socios.map((s) => (s.percentual ? Core.formatBR(s.percentual) : "")));
  const gravar = async () => {
    const lanc = linhas.filter((l) => l.valor > 0);
    if (!num(total)) { aviso("Informe o valor a distribuir."); return; }
    if (!r.soma) { aviso("Informe o faturamento dos sócios."); return; }
    if (!(await confirmar({ titulo: "Gravar o rateio?", botao: "Gravar " + lanc.length + " distribuição(ões)",
      texto: lanc.map((l) => l.socio + ": R$ " + Core.formatBR(l.base) + (l.irrf ? " (IRRF R$ " + Core.formatBR(l.irrf) + ")" : "")).join("\n") + "\n\nData: 31/12/" + ano + ". Ficam em Distribuição de lucros, onde dá para editar ou excluir." }))) return;
    setGravando(true);
    try {
      lanc.forEach((l) => luc.salvar({ empresaId: g.matriz.id, socio: l.socio, data, valor: l.valor, modo: "bruto", retencao: l.reter, ata: false, compReinf: "",
        obs: "Rateio por faturamento: " + Core.formatBR(l.pct) + "% de R$ " + Core.formatBR(r.total) }));
      aviso("Rateio gravado: " + lanc.length + " distribuição(ões) em 31/12/" + ano + ".");
      aoFechar();
    } catch (e) { aviso(e.message); setGravando(false); }
  };
  const th = "px-2 py-2 font-semibold text-right";
  return (
    <Janela aberta titulo={"Rateio por faturamento · " + g.matriz.nome} aoFechar={aoFechar} largura="max-w-[860px]"
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button><button type="button" className="btn-primario" disabled={gravando || !linhas.some((l) => l.valor > 0)} onClick={gravar}>Gravar distribuições</button></>}>
      <p className="text-[13px] text-ink-2">Cada sócio recebe a parte do valor na proporção do faturamento que gerou. As distribuições ficam com a data de 31/12/{ano}.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[13px] font-semibold">Valor a distribuir (R$)
          <input value={total} onChange={(e) => setTotal(e.target.value)} onBlur={() => setTotal(fmt(num(total)))} inputMode="decimal" placeholder="0,00" data-foco className="block mt-1 h-10 w-[180px] text-right tabular-nums" /></label>
        {sugestao > 0 && <button type="button" className="btn-fantasma btn-sm" onClick={() => setTotal(Core.formatBR(sugestao))} title="Resultado do período menos o que já foi distribuído no ano">Usar o saldo do resultado (R$ {Core.formatBR(sugestao)})</button>}
        {socios.some((s) => s.percentual) && <button type="button" className="btn-fantasma btn-sm" onClick={pelaParticipacao} title="Usa a participação de cada sócio no lugar do faturamento">Dividir pela participação</button>}
      </div>
      <div className="overflow-x-auto border border-line rounded-lg">
        <table className="w-full text-[13px]">
          <thead className="bg-surface-2 text-[11.5px] uppercase tracking-wide text-muted">
            <tr><th className="px-3 py-2 font-semibold text-left">Sócio</th><th className={th}>Faturamento (R$)</th><th className={th}>% rateio</th><th className={th}>Valor rateado</th>
              <th className="px-2 py-2 font-semibold text-center" title="IRRF de 10% sobre a base. Marcado sozinho quando o total do sócio no mês passa de R$ 50 mil.">Reter IRRF</th><th className={th}>IRRF</th><th className={th}>Líquido</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {linhas.map((l, i) => (
              <tr key={l.socio}>
                <td className="px-3 py-1.5">{l.socio}{l.participacao ? <span className="block text-[11.5px] text-muted">participação {l.participacao}%</span> : null}</td>
                <td className="px-2 py-1"><input value={fats[i]} onChange={(e) => mudaFat(i, e.target.value)} onBlur={() => mudaFat(i, fmt(num(fats[i])))} inputMode="decimal" placeholder="0,00" aria-label={"Faturamento de " + l.socio} className="h-8 w-[130px] ml-auto block text-right tabular-nums" /></td>
                <td className="px-2 py-1.5 text-right tabular-nums text-brand font-semibold">{Core.formatBR(l.pct)}%</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-credit">{R$(l.valor)}</td>
                <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={l.reter} disabled={!l.valor} onChange={(e) => setRet((x) => x.map((y, k) => (k === i ? e.target.checked : y)))} aria-label={"Reter IRRF de " + l.socio} title={l.sugere ? "Passa de R$ 50 mil no mês: retenção sugerida" : "Até R$ 50 mil no mês: sem retenção"} /></td>
                <td className={"px-2 py-1.5 text-right tabular-nums " + (l.irrf ? "text-debit" : "text-muted")}>{l.irrf ? R$(l.irrf) : "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.valor ? R$(l.liquido) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-surface-2 font-semibold">
            <tr><td className="px-3 py-2">Total</td><td className="px-2 py-2 text-right tabular-nums">{R$(r.soma)}</td><td className="px-2 py-2 text-right tabular-nums">{r.soma ? "100,00%" : "—"}</td>
              <td className="px-2 py-2 text-right tabular-nums text-credit">{R$(soma("valor"))}</td><td /><td className="px-2 py-2 text-right tabular-nums text-debit">{soma("irrf") ? R$(soma("irrf")) : "—"}</td><td className="px-2 py-2 text-right tabular-nums">{R$(soma("liquido"))}</td></tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[12.5px] text-muted">Valor rateado = faturamento do sócio ÷ faturamento total × valor a distribuir (os centavos fecham com o total). O IRRF é marcado sozinho quando o total do sócio no mês passa de R$ 50 mil; dá para mudar.</p>
    </Janela>
  );
}

function Grupo({ g, ano, aberto, alternar, aoDistribuir }) {
  const [svc] = useEncerramento();
  const [luc, vl] = useLucros();
  const { usuario } = useAuth();
  const { aviso } = useAvisos();
  const enc = g.status === "encerrado";
  const socios = useMemo(() => {
    const pagos = luc.porSocio(ano, g.matriz.id);
    const k = (s) => String(s || "").trim().toLowerCase();
    const lista = (g.matriz.socios || []).map((s) => Object.assign({ socio: s.nome, percentual: s.percentual }, pagos.find((p) => k(p.socio) === k(s.nome)) || { base: 0, irrf: 0, liquido: 0 }));
    pagos.forEach((p) => { if (!lista.some((s) => k(s.socio) === k(p.socio))) lista.push(Object.assign({ percentual: null }, p)); });
    return lista;
  }, [luc, vl, ano, g.matriz]);   // eslint-disable-line
  const distribuido = socios.reduce((t, s) => t + (s.base || 0), 0);
  const resultado = g.consolidado.calc.resultado;
  const [rateio, setRateio] = useState(false);
  const gravar = (id, k, v) => {
    if (Number.isNaN(v)) { aviso("Valor inválido."); return; }
    try { svc.salvar(id, ano, { [k]: v }); } catch (e) { aviso(e.message); }
  };
  const fechar = () => {
    try { svc.encerrar(g.matriz.id, ano, !enc, usuario ? usuario.nome : ""); aviso(enc ? "Encerramento reaberto." : g.matriz.nome + ": exercício de " + ano + " encerrado."); }
    catch (e) { aviso(e.message); }
  };
  const linhas = g.unidades.concat(g.unidades.length > 1 ? [{ consolidado: true, dados: g.consolidado.dados, calc: g.consolidado.calc }] : []);
  const c = g.consolidado.calc;
  return (
    <section className={"cartao overflow-hidden " + (enc ? "border-credit/30" : "")}>
      <button type="button" onClick={alternar} aria-expanded={aberto} className="w-full px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-left hover:bg-surface-2">
        <Icone nome="seta" className={"w-4 h-4 text-muted transition-transform " + (aberto ? "" : "-rotate-90")} />
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-[14.5px]">{g.matriz.nome}</strong>
          <span className="block text-[12px] text-muted">{g.matriz.regime || "sem regime"}{g.unidades.length > 1 ? " · matriz + " + (g.unidades.length - 1) + (g.unidades.length > 2 ? " filiais" : " filial") : ""}{!enc ? " · " + g.completas + " de " + g.unidades.length + " com números" : ""}</span>
        </span>
        <span className="text-[12.5px] text-ink-2 tabular-nums hidden md:inline">Receita {R$(g.consolidado.dados.receitaBruta)}</span>
        <span className="text-[12.5px] text-ink-2 tabular-nums hidden md:inline">Lucro bruto {R$(c.lucroBruto)}{c.pct !== null ? " (" + c.pct.toLocaleString("pt-BR") + "%)" : ""}</span>
        {enc ? <Selo tipo="ok" title={(g.por ? "por " + g.por : "") + (g.em ? " em " + dataBR(g.em) : "")}>Encerrado</Selo> : g.prontaParaEncerrar ? <Selo tipo="sugerida">Pronto para encerrar</Selo> : <Selo tipo="pendente">Pendente</Selo>}
      </button>
      {aberto && (
        <div className="border-t border-line">
          <div className="overflow-x-auto relative">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-[11.5px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold text-left min-w-[180px]">Unidade</th>
                  {CAMPOS.slice(0, 4).map(([k]) => <th key={k} className="px-2 py-2 font-semibold text-right">{CMP[k]}</th>)}
                  <th className="px-2 py-2 font-semibold text-right bg-brand-soft/50">CMV</th>
                  <th className="px-2 py-2 font-semibold text-right bg-brand-soft/50">Lucro bruto</th>
                  <th className="px-2 py-2 font-semibold text-right bg-brand-soft/50">%</th>
                  <th className="px-2 py-2 font-semibold text-right">Result. antes do estoque</th>
                  <th className="px-2 py-2 font-semibold text-right">Result. do período</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {linhas.map((u) => {
                  const nome = u.consolidado ? "Consolidado" : u.empresa.nome;
                  const travado = enc || u.consolidado;
                  return (
                    <tr key={u.consolidado ? "cons" : u.empresa.id} className={u.consolidado ? "bg-surface-2 font-semibold" : ""}>
                      <td className="px-3 py-1.5">
                        <span className={"block truncate max-w-[260px] " + (u.filial ? "pl-3 text-ink-2" : "")}>{u.filial ? "↳ " : ""}{nome}</span>
                        {!u.consolidado && <span className="block text-[11.5px] text-muted">{u.empresa.documento || ""}{!u.completa && !enc ? " · faltam números" : ""}</span>}
                      </td>
                      {CAMPOS.slice(0, 4).map(([k]) => <td key={k} className="px-1 py-1"><CampoNum valor={u.dados[k]} travado={travado} rotulo={CMP[k] + " de " + nome} aoGravar={(v) => gravar(u.empresa.id, k, v)} /></td>)}
                      <td className="px-2 py-1.5 text-right tabular-nums bg-brand-soft/30">{R$(u.calc.cmv)}</td>
                      <td className={"px-2 py-1.5 text-right tabular-nums bg-brand-soft/30 " + (u.calc.lucroBruto < 0 ? "text-debit" : "")}>{R$(u.calc.lucroBruto)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums bg-brand-soft/30">{u.calc.pct === null ? "—" : u.calc.pct.toLocaleString("pt-BR") + "%"}</td>
                      <td className="px-1 py-1"><CampoNum valor={u.dados.resultadoAntesEstoque} travado={travado} rotulo={"Resultado antes do estoque de " + nome} aoGravar={(v) => gravar(u.empresa.id, "resultadoAntesEstoque", v)} /></td>
                      <td className="px-1 py-1">
                        {u.consolidado ? <span className="block px-2 text-right tabular-nums">{R$(u.dados.resultadoPeriodo)}</span> :
                          travado ? <span className="block px-2 text-right tabular-nums" title={u.calc.resultadoInformado ? "Informado" : "Calculado: resultado antes do estoque + EF − EI"}>{R$(u.calc.resultado)}{!u.calc.resultadoInformado && u.calc.resultado !== null && <span className="block text-[11px] text-muted">calculado</span>}</span> :
                          <CampoNum valor={u.dados.resultadoPeriodo} travado={travado} rotulo={"Resultado do período de " + nome}
                            placeholder={u.calc.resultadoSugerido !== null ? Core.formatBR(u.calc.resultadoSugerido) : "0,00"} aoGravar={(v) => gravar(u.empresa.id, "resultadoPeriodo", v)} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid lg:grid-cols-[1fr_auto] gap-4 px-4 py-3.5 border-t border-line">
            <div className="space-y-2 min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="text-[14px] font-semibold">Sócios e lucros distribuídos em {ano}</h3>
                {resultado !== null && distribuido > 0 && (
                  <span className={"text-[12.5px] " + (distribuido > resultado ? "text-debit font-semibold" : "text-muted")}>
                    {R$(distribuido)} distribuídos {distribuido > resultado ? "passam do" : "dentro do"} resultado do período ({R$(resultado)})
                  </span>
                )}
              </div>
              {socios.length ? (
                <div className="overflow-x-auto"><table className="text-[13px]">
                  <thead className="text-[11.5px] uppercase tracking-wide text-muted"><tr><th className="pr-4 py-1 text-left font-semibold">Sócio</th><th className="px-3 py-1 text-right font-semibold">Participação</th><th className="px-3 py-1 text-right font-semibold">Base</th><th className="px-3 py-1 text-right font-semibold">IRRF</th><th className="pl-3 py-1 text-right font-semibold">Líquido</th></tr></thead>
                  <tbody>
                    {socios.map((s) => (
                      <tr key={s.socio}>
                        <td className="pr-4 py-1">{s.socio}</td>
                        <td className="px-3 py-1 text-right tabular-nums text-muted">{s.percentual ? s.percentual + "%" : "—"}</td>
                        <td className="px-3 py-1 text-right tabular-nums">{s.base ? R$(s.base) : "—"}</td>
                        <td className={"px-3 py-1 text-right tabular-nums " + (s.irrf ? "text-debit" : "text-muted")}>{s.irrf ? R$(s.irrf) : "—"}</td>
                        <td className="pl-3 py-1 text-right tabular-nums">{s.liquido ? R$(s.liquido) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              ) : <p className="text-[13px] text-muted">Sem sócios no cadastro. Cadastre em Departamento Cadastro › Empresas.</p>}
            </div>
            <div className="flex lg:flex-col gap-2 items-start lg:items-end">
              <button type="button" className="btn-contorno btn-sm" disabled={!(g.matriz.socios || []).length} onClick={() => aoDistribuir(g.matriz.id)}
                title={(g.matriz.socios || []).length ? "Registra em Distribuição de lucros com a data de 31/12/" + ano : "Cadastre os sócios primeiro"}>Adicionar distribuição</button>
              <button type="button" className="btn-contorno btn-sm" disabled={(g.matriz.socios || []).length < 2} onClick={() => setRateio(true)}
                title={(g.matriz.socios || []).length < 2 ? "Precisa de pelo menos 2 sócios no cadastro" : "Divide o valor entre os sócios pelo faturamento de cada um"}>Rateio por faturamento</button>
              <button type="button" className={enc ? "btn-fantasma btn-sm" : "btn-primario btn-sm"} onClick={fechar}>{enc ? "Reabrir" : "Encerrar exercício"}</button>
              {enc && g.por && <span className="text-[12px] text-muted">por {g.por}{g.em ? " em " + dataBR(g.em) : ""}</span>}
            </div>
            {rateio && <RateioFaturamento g={g} ano={ano} sugestao={resultado !== null ? Math.max(0, Math.round((resultado - distribuido) * 100) / 100) : 0} aoFechar={() => setRateio(false)} />}
          </div>
        </div>
      )}
    </section>
  );
}

export default function Encerramento() {
  const [svc, versao] = useEncerramento();
  const { usuario } = useAuth();
  const { aviso } = useAvisos();
  const [ano, setAno] = useState(svc.anoPadrao());
  const [status, setStatus] = useState("");
  const [regime, setRegime] = useState("");
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState({});
  const [dist, setDist] = useState(null);
  const r = useMemo(() => svc.grupos(ano, { status, regime, busca }), [svc, ano, status, regime, busca, versao]);   // eslint-disable-line
  const ehTeste = usuario && (usuario.teste || usuario.email === AuthCore.TESTE_EMAIL);
  const alternar = (id) => setAbertos((a) => Object.assign({}, a, { [id]: !a[id] }));
  const baixar = async () => {
    try {
      const XLSX = await carregarXlsx();
      const cab = ["Grupo (matriz)", "Unidade", "CNPJ", "Tipo"].concat(CAMPOS.slice(0, 4).map((c) => c[1]), ["CMV", "Lucro bruto", "% lucro bruto", "Resultado antes do estoque", "Resultado do período", "Status"]);
      const linhas = [cab];
      r.grupos.forEach((g) => {
        const uni = g.unidades.map((u) => [g.matriz.nome, u.empresa.nome, u.empresa.documento || "", u.filial ? "Filial" : "Matriz", u.dados, u.calc]);
        if (g.unidades.length > 1) uni.push([g.matriz.nome, "Consolidado", "", "Consolidado", g.consolidado.dados, g.consolidado.calc]);
        uni.forEach(([gr, n, doc, tipo, d, c]) => linhas.push([gr, n, doc, tipo].concat(CAMPOS.slice(0, 4).map((x) => d[x[0]]), [c.cmv, c.lucroBruto, c.pct === null ? null : c.pct / 100, d.resultadoAntesEstoque, tipo === "Consolidado" ? d.resultadoPeriodo : c.resultado, g.status === "encerrado" ? "Encerrado" : "Pendente"])));
      });
      const ws = XLSX.utils.aoa_to_sheet(linhas.map((l) => l.map((v) => (v === null || v === undefined ? "" : v))));
      Object.keys(ws).forEach((k) => { if (k[0] === "!" || typeof ws[k].v !== "number") return; ws[k].z = /^K\d/.test(k) ? "0.0%" : "#,##0.00"; });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Encerramento " + ano);
      XLSX.writeFile(wb, "encerramento-contabil-" + ano + ".xlsx");
    } catch (e) { aviso("Não consegui gerar o Excel: " + (e.message || e)); }
  };
  const chip = (on) => "rounded-full border px-3 py-1 text-[13px] " + (on ? "bg-brand-soft border-brand text-brand font-semibold" : "border-line bg-surface");
  if (!r.total && !svc.gruposDoCadastro().length) {
    return (
      <div className="cartao p-10 text-center space-y-3">
        <strong className="block text-[15px]">Nenhuma empresa cadastrada</strong>
        <span className="block text-[13.5px] text-muted">As empresas, as filiais e os sócios vêm do cadastro do Departamento Cadastro.</span>
        <Link to="/departamento-cadastro/empresas" className="btn-contorno btn-sm">Abrir Empresas</Link>
      </div>
    );
  }
  const unico = r.grupos.length === 1;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-line bg-surface">
          <button type="button" className="btn-fantasma h-9 w-9 p-0" onClick={() => setAno(String(Number(ano) - 1))} aria-label="Ano anterior">‹</button>
          <span className="px-2 text-[14px] font-semibold min-w-[110px] text-center">Exercício {ano}</span>
          <button type="button" className="btn-fantasma h-9 w-9 p-0" onClick={() => setAno(String(Number(ano) + 1))} aria-label="Próximo ano">›</button>
        </div>
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa ou CNPJ…" aria-label="Buscar empresa" className="max-w-[240px] h-9" />
        <select value={regime} onChange={(e) => setRegime(e.target.value)} aria-label="Regime" className="h-9 w-auto">
          <option value="">Todos os regimes</option>{REGIMES.map((x) => <option key={x} value={x}>{x}</option>)}<option value="(sem)">Sem regime</option>
        </select>
        <div className="flex-1" />
        {ehTeste && !r.encerrados && !r.grupos.some((g) => g.completas) && <button type="button" className="btn-fantasma btn-sm" onClick={() => { if (svc.carregarDemonstracao(ano)) aviso("Exemplos carregados em " + ano + "."); }}>Carregar demonstração</button>}
        <button type="button" className="btn-contorno btn-sm" onClick={baixar}>Baixar Excel</button>
      </div>

      <section className="cartao p-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div>
          <strong className="block text-[16px]">{r.encerrados} de {r.total} empresas encerradas em {ano}</strong>
          <span className="text-[13px] text-muted">{r.pendentes ? r.pendentes + " pendente" + (r.pendentes > 1 ? "s" : "") : "Todas encerradas"} · a matriz encerra junto com as filiais</span>
        </div>
        <div className="h-2 flex-1 min-w-[120px] rounded-full bg-surface-2 border border-line overflow-hidden"><div className="h-full bg-credit" style={{ width: (r.pct || 0) + "%" }} /></div>
        <div className="flex flex-wrap gap-1.5">
          {[["", "Todas"], ["pendente", "Pendentes"], ["encerrado", "Encerradas"]].map(([v, t]) => <button key={v} type="button" className={chip(status === v)} onClick={() => setStatus(v)}>{t}</button>)}
        </div>
      </section>

      {!r.grupos.length && <p className="cartao p-8 text-center text-muted">Nenhuma empresa com esse filtro.</p>}
      <div className="space-y-2.5">
        {r.grupos.map((g) => <Grupo key={g.matriz.id} g={g} ano={ano} aberto={unico || !!abertos[g.matriz.id]} alternar={() => alternar(g.matriz.id)} aoDistribuir={(id) => setDist(id)} />)}
      </div>
      <p className="text-[12.5px] text-muted">CMV = estoque inicial + compras − estoque final. Lucro bruto = receita bruta − CMV. Sem o resultado do período informado, ele é calculado: resultado antes do estoque + estoque final − estoque inicial. Para encerrar, todas as unidades precisam de estoques, compras e receita (zero vale).</p>
      {dist && <FormDistribuicao inicial={{ empresaId: dist, data: ano + "-12-31" }} aoFechar={() => setDist(null)} />}
    </div>
  );
}
