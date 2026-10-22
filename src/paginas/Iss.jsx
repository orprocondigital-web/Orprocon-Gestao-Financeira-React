import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import L from "../lib/iss/leitor.mjs";
import D from "../lib/iss/dados.mjs";
import { useIss } from "../lib/useIss.js";
import { useAuth } from "../lib/auth.jsx";
import { carregarXlsx } from "../lib/leitores.js";
import { useAvisos } from "../componentes/Avisos.jsx";
import { Selo } from "../componentes/contabil/ui.jsx";

/*
 * ISS Tubarão: importa o XML do Movimento Econômico (Meu ISS) de cada empresa e confere as retenções.
 * Regras em src/lib/iss/ (leitor.mjs e dados.mjs, testadas em tests/iss.test.js). Dados em "iss:v1".
 */
const R$ = (x) => (x ? L.brl(x) : "—");
const mesTitulo = (m) => D.rotuloMes(m).replace(/^./, (c) => c.toUpperCase());
const dataBr = (iso) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "");
function cnpjFmt(d) {
  d = String(d || "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d;
}
const quando = (iso) => { try { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); } catch (e) { return ""; } };

/** Lê o arquivo respeitando a codificação declarada no XML (UTF-8 ou ISO-8859-1). */
async function lerXml(f) {
  const buf = await f.arrayBuffer();
  const cabeca = new TextDecoder("ascii").decode(new Uint8Array(buf).slice(0, 200));
  const cod = ((/encoding\s*=\s*["']([^"']+)["']/i.exec(cabeca) || [])[1] || "utf-8").toLowerCase();
  try { return new TextDecoder(cod).decode(buf); } catch (e) { return new TextDecoder("utf-8").decode(buf); }
}

function Numero({ rotulo, valor, sub, destaque }) {
  return (
    <div className={"cartao px-4 py-3 " + (destaque ? "border-brand-fill" : "")}>
      <div className="text-[12px] text-muted">{rotulo}</div>
      <div className="text-xl font-semibold tabular-nums">{valor}</div>
      {sub && <div className="text-[12px] text-muted">{sub}</div>}
    </div>
  );
}

const FILTROS = [["todas", "Todas"], ["iss", "Com ISS retido"], ["federal", "Com retenção federal"], ["alerta", "Com alerta"]];

function Empresa({ mes, chave, lista, abrir, voltar }) {
  const [svc] = useIss();
  const { aviso, confirmar } = useAvisos();
  const [filtro, setFiltro] = useState("todas");
  const e = svc.estado(), reg = e.meses[mes][chave], emp = e.empresas[chave] || { nome: chave };
  const i = lista.indexOf(chave);
  const notas = reg.notas.filter((n) => (filtro === "iss" ? n.issRetido > 0 : filtro === "federal" ? n.federal > 0 : filtro === "alerta" ? n.alertas.length > 0 : true));
  const t = L.totais(notas);
  const conferir = (sim) => {
    svc.marcarConferida(mes, chave, sim);
    if (!sim) return;
    const prox = D.resumoMes(svc.estado(), mes).linhas.find((l) => !l.registro.conferida);
    aviso(prox ? "Conferida. Próxima: " + prox.empresa.nome : "Todas as empresas do mês conferidas.");
    if (prox) abrir(prox.chave); else voltar();
  };
  const remover = async () => {
    if (!(await confirmar({ titulo: "Remover o XML?", texto: "Sai o arquivo de " + emp.nome + " em " + D.rotuloMes(mes) + ".", botao: "Remover", perigo: true }))) return;
    svc.remover(mes, chave); aviso("Removido."); voltar();
  };
  const col = ["IR", "PIS", "COFINS", "CSLL", "INSS"];
  return (
    <section className="cartao overflow-hidden">
      <div className="p-4 flex flex-wrap items-start justify-between gap-3 border-b border-line">
        <div className="min-w-0">
          <button type="button" className="text-[13px] text-brand hover:underline" onClick={voltar}>‹ Todas as empresas</button>
          <h2 className="text-[18px] font-semibold">{emp.nome}</h2>
          <div className="text-[12.5px] text-muted">{[emp.cmc ? "CMC " + emp.cmc : "", cnpjFmt(emp.cnpj), D.rotuloMes(mes)].filter(Boolean).join(" · ")}</div>
          <div className="text-[12.5px] text-muted">Arquivo {reg.arquivo || "—"}, importado em {quando(reg.importadoEm)}{reg.por ? " por " + reg.por : ""}{reg.canceladas ? " · " + reg.canceladas + " nota(s) cancelada(s) ficaram de fora" : ""}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {i > 0 && <button type="button" className="btn-fantasma btn-sm" onClick={() => abrir(lista[i - 1])}>‹ Anterior</button>}
          {i < lista.length - 1 && <button type="button" className="btn-fantasma btn-sm" onClick={() => abrir(lista[i + 1])}>Próxima ›</button>}
          <button type="button" className="btn-fantasma btn-sm text-debit" onClick={remover}>Remover</button>
          {reg.conferida ? <button type="button" className="btn-contorno btn-sm" onClick={() => conferir(false)}>Desmarcar</button>
            : <button type="button" className="btn-primario btn-sm" onClick={() => conferir(true)}>Marcar como conferida</button>}
        </div>
      </div>
      {reg.avisos.length > 0 && (
        <div className="mx-4 mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[13px]"><strong>Sobre o arquivo:</strong>
          <ul className="list-disc pl-5">{reg.avisos.map((a) => <li key={a}>{a}</li>)}</ul></div>
      )}
      <div className="flex flex-wrap gap-1.5 px-4 py-3" role="group" aria-label="Filtrar notas">
        {FILTROS.map(([id, nome]) => (
          <button key={id} type="button" aria-pressed={filtro === id} onClick={() => setFiltro(id)}
            className={"rounded-full border px-3 py-1 text-[13px] " + (filtro === id ? "bg-brand-soft border-brand text-brand font-semibold" : "border-line bg-surface")}>{nome}</button>
        ))}
      </div>
      {!notas.length ? <p className="px-4 pb-6 text-muted text-[13.5px]">Nenhuma nota neste filtro.</p> : (
        <div className="overflow-x-auto relative">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 text-[11.5px] uppercase tracking-wide text-muted">
              <tr><th className="px-3 py-2 text-left font-semibold">Nº</th><th className="px-2 py-2 text-left font-semibold">Data</th><th className="px-2 py-2 text-left font-semibold min-w-[220px]">Prestador</th>
                <th className="px-2 py-2 text-left font-semibold min-w-[160px]">Atividade</th><th className="px-2 py-2 text-right font-semibold">Valor</th><th className="px-2 py-2 text-right font-semibold">ISS retido</th>
                {col.map((c) => <th key={c} className="px-2 py-2 text-right font-semibold">{c}</th>)}<th className="px-3 py-2 text-right font-semibold">Total retido</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {notas.map((n, k) => (
                <tr key={n.numero + "-" + k} className={n.alertas.length ? "bg-warn-soft/40" : ""}>
                  <td className="px-3 py-1.5 align-top">{n.numero}</td>
                  <td className="px-2 py-1.5 align-top whitespace-nowrap">{dataBr(n.data)}</td>
                  <td className="px-2 py-1.5 align-top">{n.prestadorNome}<span className="block text-[11.5px] text-muted">{cnpjFmt(n.prestadorCnpj)}</span>
                    {n.alertas.map((a) => <span key={a} className="block text-[12px] text-warn font-medium">⚠ {a}</span>)}</td>
                  <td className="px-2 py-1.5 align-top">{n.atividade}{n.tipo && n.tipo !== "TOMADOR" && <span className="block text-[11.5px] text-muted">Tipo: {n.tipo}</span>}</td>
                  <td className="px-2 py-1.5 align-top text-right tabular-nums">{R$(n.valor)}</td>
                  <td className="px-2 py-1.5 align-top text-right tabular-nums">{R$(n.issRetido)}</td>
                  {["ir", "pis", "cofins", "csll", "inss"].map((k2) => <td key={k2} className="px-2 py-1.5 align-top text-right tabular-nums">{R$(n[k2])}</td>)}
                  <td className="px-3 py-1.5 align-top text-right tabular-nums font-semibold">{R$(n.totalRetido)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-2 font-semibold"><tr>
              <td className="px-3 py-2" colSpan={4}>Totais ({t.notas} nota{t.notas === 1 ? "" : "s"})</td>
              <td className="px-2 py-2 text-right tabular-nums">{R$(t.valor)}</td><td className="px-2 py-2 text-right tabular-nums">{R$(t.issRetido)}</td>
              {["ir", "pis", "cofins", "csll", "inss"].map((k2) => <td key={k2} className="px-2 py-2 text-right tabular-nums">{R$(t[k2])}</td>)}
              <td className="px-3 py-2 text-right tabular-nums">{R$(t.totalRetido)}</td>
            </tr></tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

function ComoExportar() {
  return (
    <section className="cartao p-5 space-y-4 text-[14px] leading-relaxed">
      <div><h2 className="text-[16px] font-semibold">Como exportar o XML no Meu ISS</h2><p className="text-[13px] text-muted">Uma vez por empresa. Depois traga todos os arquivos de uma vez.</p></div>
      <ol className="list-decimal pl-5 space-y-1">
        <li>Entre no <b>Meu ISS</b> de Tubarão com o acesso do escritório (contador).</li>
        <li>Na lista de clientes, escolha a empresa e clique em <b>Acessar Movimento Econômico</b>.</li>
        <li>No menu <b>Períodos</b>, abra <b>Exportar XML</b>.</li>
        <li>Escolha o mês no período inicial e no final (o mesmo mês), deixe os lançamentos em <b>Todos</b> e clique em <b>Gerar Arquivo</b>.</li>
        <li>Volte para a lista de clientes e repita para as outras empresas.</li>
        <li>Aqui, em <b>Empresas do mês</b>, arraste todos os XML juntos (ou <b>Importar XML</b>). Cada arquivo vira uma empresa, no mês das notas.</li>
      </ol>
      <h2 className="text-[16px] font-semibold">O que o sistema confere</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li><b>ISS retido</b> (substituto): o ISS das notas em que a empresa é a tomadora. Notas canceladas ficam de fora.</li>
        <li><b>Retenções federais</b>: IR, PIS, COFINS, CSLL e INSS de cada nota.</li>
        <li><b>Alertas</b>: alíquota de ISS fora de 2% a 5%, base maior que a nota, líquido que não fecha com as retenções, nota tomada sem ISS.</li>
        <li>Valores com vírgula ou ponto decimal são aceitos. O que o sistema não reconhecer aparece como aviso na empresa.</li>
      </ul>
    </section>
  );
}

export default function Iss() {
  const [svc, versao] = useIss();
  const { usuario } = useAuth();
  const { aviso, confirmar } = useAvisos();
  const local = useLocation();
  const [aba, setAba] = useState("mes");
  const [aberta, setAberta] = useState(null);
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef(null);
  // vindo do Início com o mês escolhido
  useEffect(() => { const p = local.state && local.state.prefs; if (p && p["iss:mes"]) svc.definirMes(p["iss:mes"]); }, [local.key]);   // eslint-disable-line
  const mes = svc.mes();
  const e = svc.estado();
  const r = useMemo(() => D.resumoMes(e, mes), [e, mes, versao]);   // eslint-disable-line
  const g = r.geral;
  const lista = r.linhas.map((l) => l.chave);
  const irMes = (m) => { svc.definirMes(m); setAberta(null); };
  const outros = D.mesesComDados(e).filter((m) => m !== mes);

  async function importar(arquivos) {
    const xs = Array.from(arquivos || []).filter((f) => /\.xml$/i.test(f.name) || /xml/.test(f.type));
    if (!xs.length) { aviso("Escolha arquivos .xml exportados do Meu ISS."); return; }
    const rs = await Promise.all(xs.map(async (f) => {
      try { return { ok: L.ler(await lerXml(f), f.name) }; } catch (err) { return { erro: err.message.indexOf(f.name) === 0 ? err.message : f.name + ": " + err.message }; }
    }));
    const lidos = rs.filter((x) => x.ok).map((x) => x.ok);
    const erros = rs.filter((x) => x.erro).map((x) => x.erro);
    const repetidas = lidos.filter((l) => { const k = D.chaveDe(l.empresa), mm = l.mes || mes; return k && e.meses[mm] && e.meses[mm][k]; });
    if (repetidas.length && !(await confirmar({ titulo: "Substituir?", texto: repetidas.length + " empresa(s) já tinham XML importado nesse mês. Substituir pelos arquivos novos?", botao: "Substituir" }))) return;
    const porMes = {};
    lidos.forEach((l) => {
      const mm = l.mes || mes;
      try { svc.importar(mm, l, usuario ? usuario.nome : ""); porMes[mm] = (porMes[mm] || 0) + 1; } catch (err) { erros.push(err.message); }
    });
    const meses = Object.keys(porMes).sort();
    if (meses.length && meses.indexOf(mes) < 0) svc.definirMes(meses[meses.length - 1]);
    setAberta(null); setAba("mes");
    const msg = meses.map((m) => porMes[m] + " empresa(s) em " + D.rotuloMes(m)).join(", ");
    aviso((msg ? "Importado: " + msg + "." : "") + (erros.length ? " Não importados: " + erros.join(" · ") : ""));
  }

  async function exportar() {
    if (!r.linhas.length) return;
    try {
      const XLSX = await carregarXlsx();
      const VAL = ["valor", "issRetido", "ir", "pis", "cofins", "csll", "inss", "federal", "totalRetido"];
      const NOMES = ["Valor", "ISS retido", "IR", "PIS", "COFINS", "CSLL", "INSS", "Federais", "Total retido"];
      const wb = XLSX.utils.book_new();
      const folha = (linhas, nome) => {
        const ws = XLSX.utils.aoa_to_sheet(linhas);
        Object.keys(ws).forEach((k) => { if (k[0] !== "!" && typeof ws[k].v === "number" && !/^[A-D]\d/.test(k)) ws[k].z = "#,##0.00"; });
        XLSX.utils.book_append_sheet(wb, ws, nome);
      };
      const resumo = [["Empresa", "CMC", "CNPJ", "Notas"].concat(NOMES, ["Alertas", "Situação"])];
      r.linhas.forEach((l) => resumo.push([l.empresa.nome, l.empresa.cmc || "", cnpjFmt(l.empresa.cnpj), l.t.notas].concat(VAL.map((k) => l.t[k]), [l.t.alertas + l.avisos, l.registro.conferida ? "Conferida" : "A conferir"])));
      resumo.push(["TOTAL", "", "", g.notas].concat(VAL.map((k) => g[k])));
      folha(resumo, "Resumo");
      const notas = (filtro) => {
        const out = [["Empresa", "CMC", "Nº NFS-e", "Data", "Prestador", "CNPJ prestador", "Atividade"].concat(NOMES, ["Alertas"])];
        r.linhas.forEach((l) => l.registro.notas.filter(filtro).forEach((n) =>
          out.push([l.empresa.nome, l.empresa.cmc || "", n.numero, dataBr(n.data), n.prestadorNome, cnpjFmt(n.prestadorCnpj), n.atividade].concat(VAL.map((k) => n[k]), [n.alertas.join(" | ")]))));
        return out;
      };
      folha(notas(() => true), "Todas as notas");
      folha(notas((n) => n.federal > 0), "Retenção federal");
      folha(notas((n) => n.alertas.length > 0), "Alertas");
      XLSX.writeFile(wb, "ISS_Tubarao_" + mes + ".xlsx");
    } catch (err) { aviso("Não consegui gerar o Excel: " + (err.message || err)); }
  }

  const limparTudo = async () => {
    if (!(await confirmar({ titulo: "Apagar tudo do ISS Tubarão?", texto: Object.keys(e.empresas).length + " empresa(s) e os XML de todos os meses. Não dá para desfazer.", botao: "Apagar tudo", perigo: true }))) return;
    svc.limparTudo(); setAberta(null); aviso("ISS Tubarão zerado.");
  };
  const soltar = {
    onDragOver: (ev) => { ev.preventDefault(); if (!arrastando) setArrastando(true); },
    onDragLeave: (ev) => { if (ev.currentTarget === ev.target) setArrastando(false); },
    onDrop: (ev) => { ev.preventDefault(); setArrastando(false); if (ev.dataTransfer.files.length) importar(ev.dataTransfer.files); }
  };
  const temExemplo = D.temExemplo(e);
  const empresaAberta = aberta && e.meses[mes] && e.meses[mes][aberta];

  return (
    <div className="space-y-4 relative" {...soltar}>
      <input ref={entrada} type="file" hidden multiple accept=".xml,text/xml,application/xml" onChange={(ev) => { if (ev.target.files.length) importar(ev.target.files); ev.target.value = ""; }} />
      {arrastando && <div className="absolute inset-0 z-20 rounded-2xl border-2 border-dashed border-brand bg-brand-soft/80 flex items-center justify-center text-[18px] font-semibold text-brand pointer-events-none">Solte os XML aqui</div>}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-line bg-surface">
          <button type="button" className="btn-fantasma h-9 w-9 p-0" onClick={() => irMes(D.somarMes(mes, -1))} aria-label="Mês anterior">‹</button>
          <span className="px-2 text-[14px] font-semibold min-w-[150px] text-center">{mesTitulo(mes)}</span>
          <button type="button" className="btn-fantasma h-9 w-9 p-0" onClick={() => irMes(D.somarMes(mes, 1))} aria-label="Mês seguinte">›</button>
        </div>
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="tablist">
          {[["mes", "Empresas do mês"], ["como", "Como exportar do Meu ISS"]].map(([id, nome]) => (
            <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => { setAba(id); setAberta(null); }}
              className={"rounded-md px-3 py-1.5 text-[13px] " + (aba === id ? "bg-brand-soft text-brand font-semibold" : "text-ink-2")}>{nome}</button>
          ))}
        </div>
        <div className="flex-1" />
        <button type="button" className="btn-primario btn-sm" onClick={() => entrada.current.click()}>Importar XML</button>
        {r.linhas.length > 0 && <button type="button" className="btn-contorno btn-sm" onClick={exportar}>Exportar Excel</button>}
      </div>

      {temExemplo && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-info-soft px-4 py-2.5 text-[13px]">
          <span><strong>Dados de exemplo.</strong> Empresas e prestadores fictícios para conhecer o módulo.</span>
          <button type="button" className="btn-contorno btn-sm" onClick={() => { svc.removerExemplo(); setAberta(null); aviso("Exemplo removido."); }}>Remover exemplo</button>
        </div>
      )}

      {aba === "como" ? <ComoExportar /> : empresaAberta ? (
        <Empresa mes={mes} chave={aberta} lista={lista} abrir={(k) => { setAberta(k); window.scrollTo(0, 0); }} voltar={() => setAberta(null)} />
      ) : !r.linhas.length ? (
        <section className="cartao p-8 text-center space-y-4">
          <div><strong className="block text-[15px]">Nenhum XML importado em {D.rotuloMes(mes)}</strong>
            <span className="text-[13.5px] text-muted">No Meu ISS, exporte o XML do Movimento Econômico de cada empresa e traga todos de uma vez para cá.</span></div>
          <button type="button" onClick={() => entrada.current.click()} className="w-full max-w-[560px] mx-auto block rounded-xl border-2 border-dashed border-line-strong bg-surface-2 px-6 py-8 hover:border-brand-fill">
            <strong className="block text-[14.5px]">Arraste os XML aqui ou clique para escolher</strong>
            <span className="text-[13px] text-muted">Pode selecionar vários arquivos juntos (um por empresa).</span>
          </button>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-fantasma btn-sm" onClick={() => setAba("como")}>Como exportar do Meu ISS</button>
            {!temExemplo && <button type="button" className="btn-contorno btn-sm" onClick={() => { const x = svc.exemplo(mes); aviso("Exemplo carregado: " + x.empresas + " empresas fictícias."); }}>Ver com dados de exemplo</button>}
          </div>
          {outros.length > 0 && <p className="text-[13px] text-muted">Meses com dados: {outros.slice(0, 6).map((m, k) => <span key={m}>{k ? " · " : ""}<button type="button" className="text-brand hover:underline" onClick={() => irMes(m)}>{D.rotuloMes(m)}</button></span>)}</p>}
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
            <Numero rotulo="Empresas" valor={g.empresas} sub={g.conferidas + " conferida(s)"} destaque />
            <Numero rotulo="Notas" valor={g.notas} sub={g.comIssRetido + " com ISS retido"} />
            <Numero rotulo="ISS retido" valor={L.brl(g.issRetido)} sub="ISS substituto (tomador)" />
            <Numero rotulo="Retenções federais" valor={L.brl(g.federal)} sub={g.comFederal + " nota(s) com retenção"} />
            <Numero rotulo="Total retido" valor={L.brl(g.totalRetido)} sub={g.alertas ? g.alertas + " nota(s) para olhar" : "nenhum alerta"} />
          </div>
          <section className="cartao overflow-hidden">
            <div className="overflow-x-auto relative">
              <table className="w-full text-[13px]">
                <thead className="bg-surface-2 text-[11.5px] uppercase tracking-wide text-muted">
                  <tr><th className="px-3 py-2.5 text-left font-semibold min-w-[220px]">Empresa</th><th className="px-2 py-2.5 text-left font-semibold">Situação</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Notas</th><th className="px-2 py-2.5 text-right font-semibold">Valor dos serviços</th>
                    <th className="px-2 py-2.5 text-right font-semibold">ISS retido</th><th className="px-2 py-2.5 text-right font-semibold">Federais</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Total retido</th><th className="px-2 py-2.5 text-right font-semibold">Alertas</th><th className="px-3 py-2.5" /></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.linhas.map((l) => {
                    const al = l.t.alertas + l.avisos;
                    return (
                      <tr key={l.chave} className="hover:bg-surface-2 cursor-pointer" onClick={() => setAberta(l.chave)}>
                        <td className="px-3 py-2"><strong className="block font-medium">{l.empresa.nome}</strong>
                          <span className="text-[11.5px] text-muted">{[l.empresa.cmc ? "CMC " + l.empresa.cmc : "", cnpjFmt(l.empresa.cnpj)].filter(Boolean).join(" · ")}</span></td>
                        <td className="px-2 py-2">{l.registro.conferida ? <Selo tipo="ok">Conferida</Selo> : <Selo tipo="pendente">A conferir</Selo>}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{l.t.notas}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{R$(l.t.valor)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{R$(l.t.issRetido)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{R$(l.t.federal)}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold">{R$(l.t.totalRetido)}</td>
                        <td className="px-2 py-2 text-right">{al ? <Selo tipo="erro">{al}</Selo> : <span className="text-muted">—</span>}</td>
                        <td className="px-3 py-2 text-right"><button type="button" className="btn-contorno btn-sm" onClick={(ev) => { ev.stopPropagation(); setAberta(l.chave); }}>Conferir</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <p className="text-[12.5px] text-muted">Arraste mais XML para esta tela a qualquer momento. Importar de novo a mesma empresa no mesmo mês substitui o anterior.</p>
        </>
      )}
      {Object.keys(e.empresas).length > 0 && aba === "mes" && !empresaAberta && (
        <p className="text-right text-[12.5px] text-muted">Para testar do zero: <button type="button" className="text-debit hover:underline" onClick={limparTudo}>apagar tudo do ISS Tubarão</button></p>
      )}
    </div>
  );
}
