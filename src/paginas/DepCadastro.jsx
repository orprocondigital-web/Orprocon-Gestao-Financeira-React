import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Core } from "../lib/legado.js";
import { DEMONSTRATIVOS, MESES, STATUS_DEMO, TIPOS_ALVARAS, TIPOS_CERTIDOES, lerCertidao, textoSituacao } from "../lib/depCadastro.mjs";
import { abrirArquivo, apagarArquivo, guardarArquivo } from "../lib/arquivos.js";
import { textoDoPdf } from "../lib/leitores.js";
import Importar, { carregarDemo } from "../componentes/depCadastro/Importar.jsx";
import { useDepCadastro } from "../lib/useDepCadastro.js";
import { useAvisos } from "../componentes/Avisos.jsx";
import Janela from "../componentes/Janela.jsx";
import Icone from "../componentes/Icone.jsx";
import { BotaoArquivo, Campo, Segmentado, Selo, dataBR, numero } from "../componentes/contabil/ui.jsx";

/*
 * Departamento Cadastro: Certidões e Alvarás (com vencimento), Faturamentos (por empresa e mês) e
 * Demonstrativos contábeis (por empresa e ano). Regras em src/lib/depCadastro.mjs.
 */
const SELO_SIT = { vencido: "erro", "7": "pendente", "30": "novo", ok: "ok", sem: "neutro" };

/** Tela vazia: explica e oferece a demonstração e a importação. */
function Vazio({ titulo, texto }) {
  const [svc] = useDepCadastro();
  const { aviso } = useAvisos();
  return (
    <div className="p-10 text-center space-y-3">
      <strong className="block text-[15px]">{titulo}</strong>
      <span className="block text-muted text-[13.5px]">{texto}</span>
      <div className="flex flex-wrap justify-center gap-2 pt-1">
        <button type="button" className="btn-contorno btn-sm" onClick={() => aviso(carregarDemo(svc) ? "Demonstração carregada." : "Já há dados: a demonstração só entra onde está vazio.")}>Carregar demonstração</button>
        <Link to="/departamento-cadastro/importar" className="btn-contorno btn-sm">Importar PDF ou planilha</Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- empresas
function JanelaEmpresas({ aoFechar }) {
  const [svc] = useDepCadastro();
  const { aviso, confirmar } = useAvisos();
  const [ed, setEd] = useState(null);   // {id?, nome, documento}
  const [erro, setErro] = useState("");
  const lista = svc.empresas();
  const salvar = (ev) => {
    ev.preventDefault();
    try { svc.salvarEmpresa(ed, ed.id); aviso(ed.id ? "Empresa atualizada." : "Empresa cadastrada."); setEd(null); setErro(""); } catch (e) { setErro(e.message); }
  };
  const excluir = async (c) => {
    if (!(await confirmar({ titulo: "Excluir " + c.nome + "?", perigo: true, botao: "Excluir", texto: "Os faturamentos e demonstrativos dela também saem." }))) return;
    try { svc.excluirEmpresa(c.id); aviso("Empresa excluída."); } catch (e) { setErro(e.message); }
  };
  return (
    <Janela aberta titulo="Empresas" aoFechar={aoFechar} largura="max-w-[560px]"
      rodape={<button type="button" className="btn-fantasma" onClick={aoFechar}>Fechar</button>}>
      <form onSubmit={salvar} className="grid sm:grid-cols-[minmax(0,1fr)_170px_auto] gap-2 items-end">
        <Campo rotulo={ed && ed.id ? "Editando" : "Nova empresa"} id="emp-nome">
          <input id="emp-nome" value={ed ? ed.nome : ""} onChange={(e) => setEd(Object.assign({}, ed || {}, { nome: e.target.value }))} placeholder="Razão social" data-foco autoComplete="off" /></Campo>
        <Campo rotulo="CNPJ/CPF" id="emp-doc"><input id="emp-doc" value={ed ? ed.documento || "" : ""} onChange={(e) => setEd(Object.assign({}, ed || {}, { documento: e.target.value }))} autoComplete="off" /></Campo>
        <div className="flex gap-1"><button type="submit" className="btn-primario h-10">{ed && ed.id ? "Salvar" : "Adicionar"}</button>
          {ed && ed.id && <button type="button" className="btn-fantasma h-10" onClick={() => setEd(null)}>Cancelar</button>}</div>
      </form>
      {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
      <ul className="divide-y divide-line border border-line rounded-lg max-h-[320px] overflow-y-auto">
        {!lista.length && <li className="px-3 py-4 text-center text-muted text-[13.5px]">Nenhuma empresa ainda.</li>}
        {lista.map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-[13.5px]">
            <span className="flex-1 min-w-0"><strong className="block truncate font-medium">{c.nome}</strong>{c.documento && <span className="text-[12px] text-muted">{c.documento}</span>}</span>
            <button type="button" className="btn-fantasma btn-sm" onClick={() => { setEd({ id: c.id, nome: c.nome, documento: c.documento }); setErro(""); }}>Editar</button>
            <button type="button" className="btn-perigo btn-sm" onClick={() => excluir(c)}>Excluir</button>
          </li>
        ))}
      </ul>
    </Janela>
  );
}

// ---------------------------------------------------------------- certidões e alvarás
function FormDocumento({ grupo, editando, aoFechar }) {
  const [svc] = useDepCadastro();
  const { aviso } = useAvisos();
  const tipos = grupo === "alvaras" ? TIPOS_ALVARAS : TIPOS_CERTIDOES;
  const [f, setF] = useState(() => Object.assign({ clienteId: "", tipo: tipos[0], numero: "", emissao: "", vencimento: "", responsavel: "", link: "", observacoes: "" }, editando || {}));
  const [erro, setErro] = useState("");
  const [pdf, setPdf] = useState(null);
  const muda = (c) => (e) => setF((x) => Object.assign({}, x, { [c]: e.target.value }));
  const anexar = async (file) => {
    setPdf(file);
    try {   // lê o PDF e preenche o que estiver vazio
      const r = lerCertidao(await textoDoPdf(file));
      const emp = svc.empresaPorDocumento(r.documento);
      setF((x) => Object.assign({}, x, {
        clienteId: x.clienteId || (emp ? emp.id : ""), tipo: editando ? x.tipo : (r.tipo || x.tipo),
        vencimento: x.vencimento || r.vencimento, emissao: x.emissao || r.emissao, numero: x.numero || r.numero
      }));
    } catch (e) { /* PDF de imagem: só anexa */ }
  };
  const salvar = async (ev) => {
    ev.preventDefault();
    try {
      const d = svc.salvarDocumento(f, editando && editando.id);
      if (pdf) { await guardarArquivo(d.id, pdf); svc.marcarAnexo(d.id, { nome: pdf.name, tamanho: pdf.size }); }
      aviso(editando ? "Documento atualizado." : "Documento cadastrado."); aoFechar();
    } catch (e) { setErro(e.message); }
  };
  const empresas = svc.empresas();
  return (
    <Janela aberta titulo={(editando ? "Editar " : "Nova ") + (grupo === "alvaras" ? "alvará" : "certidão")} aoFechar={aoFechar} largura="max-w-[620px]"
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button><button type="submit" form="form-doc" className="btn-primario">Salvar</button></>}>
      <form id="form-doc" onSubmit={salvar} className="grid sm:grid-cols-2 gap-3">
        <Campo rotulo="Empresa" id="doc-emp" className="sm:col-span-2">
          <select id="doc-emp" value={f.clienteId} onChange={muda("clienteId")} data-foco>
            <option value="">Escolha…</option>{empresas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Tipo" id="doc-tipo">
          <input id="doc-tipo" list="doc-tipos" value={f.tipo} onChange={muda("tipo")} autoComplete="off" />
          <datalist id="doc-tipos">{tipos.map((t) => <option key={t} value={t} />)}</datalist>
        </Campo>
        <Campo rotulo="Número" id="doc-num"><input id="doc-num" value={f.numero} onChange={muda("numero")} autoComplete="off" /></Campo>
        <Campo rotulo="Emissão" id="doc-em"><input id="doc-em" type="date" value={f.emissao} onChange={muda("emissao")} /></Campo>
        <Campo rotulo="Vencimento" id="doc-venc"><input id="doc-venc" type="date" value={f.vencimento} onChange={muda("vencimento")} /></Campo>
        <Campo rotulo="Responsável" id="doc-resp"><input id="doc-resp" value={f.responsavel} onChange={muda("responsavel")} autoComplete="off" /></Campo>
        <Campo rotulo="Link do arquivo (opcional)" id="doc-link"><input id="doc-link" value={f.link} onChange={muda("link")} placeholder="https://…" autoComplete="off" /></Campo>
        <Campo rotulo="Observações" id="doc-obs" className="sm:col-span-2"><input id="doc-obs" value={f.observacoes} onChange={muda("observacoes")} autoComplete="off" /></Campo>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2 text-[13px]">
          <BotaoArquivo className="btn-contorno btn-sm" aceita=".pdf" aoEscolher={anexar}>{pdf || (editando && editando.anexo) ? "Trocar o PDF" : "Anexar o PDF"}</BotaoArquivo>
          <span className="text-muted">{pdf ? pdf.name + " (os campos vazios foram preenchidos pelo PDF)" : editando && editando.anexo ? "Anexado: " + editando.anexo.nome : "Opcional. Ao anexar, o sistema lê tipo, CNPJ, datas e número."}</span>
        </div>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
      {!empresas.length && <p className="text-[13px] text-warn">Cadastre a empresa primeiro (botão Empresas).</p>}
      {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
    </Janela>
  );
}

function Renovar({ doc, aoFechar }) {
  const [svc] = useDepCadastro();
  const { aviso } = useAvisos();
  const [f, setF] = useState({ vencimento: "", emissao: svc.hoje(), numero: "", obs: "" });
  const [erro, setErro] = useState("");
  const salvar = () => { try { svc.renovar(doc.id, f); aviso("Renovação registrada."); aoFechar(); } catch (e) { setErro(e.message); } };
  const muda = (c) => (e) => setF((x) => Object.assign({}, x, { [c]: e.target.value }));
  return (
    <Janela aberta titulo={"Renovar: " + doc.tipo} aoFechar={aoFechar}
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button><button type="button" className="btn-primario" onClick={salvar}>Registrar renovação</button></>}>
      <p className="text-[13.5px] text-ink-2">{doc.empresa} · vencimento atual {dataBR(doc.vencimento)}. O anterior fica no histórico.</p>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Novo vencimento" id="ren-venc"><input id="ren-venc" type="date" value={f.vencimento} onChange={muda("vencimento")} data-foco /></Campo>
        <Campo rotulo="Emissão" id="ren-em"><input id="ren-em" type="date" value={f.emissao} onChange={muda("emissao")} /></Campo>
        <Campo rotulo="Novo número (opcional)" id="ren-num"><input id="ren-num" value={f.numero} onChange={muda("numero")} /></Campo>
        <Campo rotulo="Observação" id="ren-obs"><input id="ren-obs" value={f.obs} onChange={muda("obs")} /></Campo>
      </div>
      {doc.historico && doc.historico.length > 0 && (
        <div className="text-[12.5px] text-muted"><strong className="text-ink-2">Renovações anteriores:</strong>
          <ul className="mt-1 space-y-0.5">{doc.historico.slice().reverse().map((h, i) => <li key={i}>{dataBR(h.data)}: {dataBR(h.vencimentoAnterior)} → {dataBR(h.novoVencimento)}{h.obs ? " · " + h.obs : ""}</li>)}</ul>
        </div>
      )}
      {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
    </Janela>
  );
}

function Documentos({ grupo }) {
  const [svc, versao] = useDepCadastro();
  const { aviso } = useAvisos();
  const lista = useMemo(() => svc.documentos(grupo), [svc, grupo, versao]);   // eslint-disable-line
  const r = useMemo(() => svc.resumo(grupo), [svc, grupo, versao]);   // eslint-disable-line
  const [filtro, setFiltro] = useState("atencao");
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState(null);   // { editando }
  const [renovando, setRenovando] = useState(null);
  const [empresas, setEmpresas] = useState(false);
  useEffect(() => { setFiltro("atencao"); setBusca(""); }, [grupo]);
  const nome = grupo === "alvaras" ? "alvará" : "certidão";
  const visiveis = lista.filter((d) => {
    if (filtro === "atencao" && !["vencido", "7", "30"].includes(d.situacao.status)) return false;
    if (filtro === "vencido" && d.situacao.status !== "vencido") return false;
    const b = busca.trim().toLowerCase();
    return !b || [d.empresa, d.tipo, d.numero, d.responsavel].some((x) => String(x || "").toLowerCase().indexOf(b) > -1);
  });
  const excluir = (d) => {
    const des = svc.excluirDocumento(d.id);
    if (!des) return;
    let desfeito = false;
    aviso("Documento excluído.", { desfazer: () => { desfeito = true; des(); } });
    if (d.anexo) setTimeout(() => { if (!desfeito) apagarArquivo(d.id); }, 8000);   // o PDF sai depois do prazo do Desfazer
  };
  const verPdf = (d) => abrirArquivo(d.id).catch((e) => aviso(e.message));
  const cartoes = [["Vencidos", r.vencido, "text-debit"], ["Vencem em até 7 dias", r["7"], "text-warn"], ["Em até 30 dias", r["30"], "text-brand"], ["Em dia", r.ok, "text-credit"]];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cartoes.map(([t, n, cor]) => (
          <div key={t} className="cartao px-4 py-3"><div className="text-[12.5px] text-muted">{t}</div><div className={"text-[24px] font-semibold tabular-nums " + (n ? cor : "text-muted")}>{numero(n)}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmentado pequeno rotulo="Mostrar" valor={filtro} aoMudar={setFiltro}
          opcoes={[["atencao", "Pedem atenção"], ["vencido", "Vencidos"], ["todos", "Todos (" + numero(r.total) + ")"]]} />
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa, tipo, número…" aria-label="Buscar" className="max-w-[300px] h-9" />
        <div className="flex-1" />
        <button type="button" className="btn-contorno btn-sm" onClick={() => setEmpresas(true)}>Empresas</button>
        <button type="button" className="btn-primario btn-sm" onClick={() => setForm({ editando: null })}><Icone nome="mais" />Nova {nome}</button>
      </div>
      <div className="cartao overflow-hidden">
        {!lista.length ? <Vazio titulo={"Nenhuma " + nome + " cadastrada"} texto={"Cadastre em Nova " + nome + ", importe os PDFs ou uma planilha, ou carregue a demonstração para ver como fica."} />
        : !visiveis.length ? (
          <div className="p-10 text-center"><strong className="block text-[15px]">{filtro === "atencao" ? "Nada vencendo nos próximos 30 dias" : "Nada com esse filtro"}</strong>
            <span className="text-muted text-[13.5px]">Escolha Todos para ver a lista inteira.</span></div>
        ) : (
          <div className="overflow-x-auto relative">
            <table className="w-full text-[13.5px]">
              <thead className="bg-surface-2 text-left text-[12px] uppercase tracking-wide text-muted">
                <tr><th className="px-3 py-2.5 font-semibold">Empresa</th><th className="px-3 py-2.5 font-semibold">Documento</th><th className="px-3 py-2.5 font-semibold">Vencimento</th>
                  <th className="px-3 py-2.5 font-semibold">Situação</th><th className="px-3 py-2.5 font-semibold">Responsável</th><th className="px-3 py-2.5"><span className="sr-only">Ações</span></th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visiveis.map((d) => (
                  <tr key={d.id} className="hover:bg-surface-2 align-top">
                    <td className="px-3 py-2 font-medium min-w-[180px]">{d.empresa}</td>
                    <td className="px-3 py-2 min-w-[150px]">{d.tipo}{(d.numero || d.link) && <span className="block text-[12px] text-muted">{d.numero}{d.link && <> {d.numero ? "· " : ""}<a href={d.link} target="_blank" rel="noopener noreferrer" className="text-brand underline">link</a></>}</span>}
                      {d.anexo && <button type="button" onClick={() => verPdf(d)} className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline" title={d.anexo.nome}>PDF</button>}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{dataBR(d.vencimento)}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><Selo tipo={SELO_SIT[d.situacao.status]}>{textoSituacao(d.situacao)}</Selo></td>
                    <td className="px-3 py-2">{d.responsavel}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-right">
                      <button type="button" className="btn-contorno btn-sm" onClick={() => setRenovando(d)}>Renovar</button>
                      <button type="button" className="btn-fantasma btn-sm" onClick={() => setForm({ editando: d })}>Editar</button>
                      <button type="button" className="btn-perigo btn-sm" onClick={() => excluir(d)}>Excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {form && <FormDocumento grupo={grupo} editando={form.editando} aoFechar={() => setForm(null)} />}
      {renovando && <Renovar doc={renovando} aoFechar={() => setRenovando(null)} />}
      {empresas && <JanelaEmpresas aoFechar={() => setEmpresas(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------- faturamentos
function CelulaValor({ valor, aoMudar, rotulo }) {
  const fmt = (v) => (v || v === 0 ? Core.formatBR(v) : "");
  const [txt, setTxt] = useState(fmt(valor));
  useEffect(() => { setTxt(fmt(valor)); }, [valor]);
  const gravar = () => {
    const t = txt.trim();
    if (!t) { if (valor !== undefined) aoMudar(null); return; }
    const n = Core.parseValor(t);
    if (isNaN(n)) { setTxt(fmt(valor)); return; }
    if (n !== valor) aoMudar(Math.abs(n)); else setTxt(fmt(valor));
  };
  return <input value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={gravar} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
    aria-label={rotulo} inputMode="decimal" className="h-8 w-[104px] px-2 text-right tabular-nums text-[13px] border-transparent bg-transparent hover:border-line focus:bg-surface" />;
}

function Faturamentos() {
  const [svc, versao] = useDepCadastro();
  const atual = new Date().getFullYear();
  const [ano, setAno] = useState(String(atual));
  const [empresas, setEmpresas] = useState(false);
  const lista = svc.empresas();
  const fat = useMemo(() => svc.faturamentos(ano), [svc, ano, versao]);   // eslint-disable-line
  const totMes = MESES.map((_, i) => lista.reduce((t, c) => t + (((fat[c.id] || {})[String(i + 1).padStart(2, "0")]) || 0), 0));
  const anos = [atual - 2, atual - 1, atual, atual + 1].map(String);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmentado pequeno rotulo="Ano" valor={ano} aoMudar={setAno} opcoes={anos.map((a) => [a, a])} />
        <p className="text-[13px] text-muted">Clique no mês e digite o valor faturado. Grava sozinho ao sair do campo.</p>
        <div className="flex-1" />
        <button type="button" className="btn-contorno btn-sm" onClick={() => setEmpresas(true)}>Empresas</button>
      </div>
      <div className="cartao overflow-hidden">
        {!lista.length ? <Vazio titulo="Nenhuma empresa cadastrada" texto="Cadastre as empresas (botão Empresas), importe uma planilha de faturamento ou carregue a demonstração." /> : (
          <div className="overflow-x-auto relative">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-[12px] uppercase tracking-wide text-muted">
                <tr><th className="px-3 py-2.5 font-semibold text-left sticky left-0 bg-surface-2 z-10 min-w-[200px]">Empresa</th>
                  {MESES.map((m) => <th key={m} className="px-2 py-2.5 font-semibold text-right">{m}</th>)}
                  <th className="px-3 py-2.5 font-semibold text-right">Total {ano}</th><th className="px-3 py-2.5 font-semibold text-right" title="Soma dos últimos 12 meses até dezembro deste ano ou até o mês atual">Últ. 12 meses</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lista.map((c) => {
                  const e = fat[c.id] || {};
                  const ate = ano === String(atual) ? ano + "-" + String(new Date().getMonth() + 1).padStart(2, "0") : ano + "-12";
                  return (
                    <tr key={c.id} className="hover:bg-surface-2">
                      <td className="px-3 py-1 font-medium sticky left-0 bg-surface z-10">{c.nome}</td>
                      {MESES.map((m, i) => { const k = String(i + 1).padStart(2, "0"); return (
                        <td key={k} className="px-0.5 py-0.5 text-right"><CelulaValor valor={e[k]} rotulo={c.nome + " " + m + "/" + ano} aoMudar={(v) => svc.definirFaturamento(ano, c.id, k, v)} /></td>); })}
                      <td className="px-3 py-1 text-right font-semibold tabular-nums whitespace-nowrap">{Core.formatBR(svc.totalAno(ano, c.id))}</td>
                      <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap text-muted">{Core.formatBR(svc.ultimos12(c.id, ate))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-surface-2 font-semibold"><tr><td className="px-3 py-2 sticky left-0 bg-surface-2">Total</td>
                {totMes.map((t, i) => <td key={i} className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{t ? Core.formatBR(t) : "—"}</td>)}
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{Core.formatBR(totMes.reduce((a, b) => a + b, 0))}</td><td /></tr></tfoot>
            </table>
          </div>
        )}
      </div>
      {empresas && <JanelaEmpresas aoFechar={() => setEmpresas(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------- demonstrativos
const COR_DEMO = { "": "border-warn/40 bg-warn-soft text-warn", emitido: "border-info/40 bg-info-soft text-info", entregue: "border-credit/40 bg-ok-soft text-credit", nao_se_aplica: "border-line bg-surface-2 text-muted" };
function Demonstrativos() {
  const [svc, versao] = useDepCadastro();
  const atual = new Date().getFullYear();
  const [ano, setAno] = useState(String(atual - 1));
  const [empresas, setEmpresas] = useState(false);
  const lista = svc.empresas();
  const dem = useMemo(() => svc.demonstrativos(ano), [svc, ano, versao]);   // eslint-disable-line
  const p = useMemo(() => svc.progressoDemonstrativos(ano), [svc, ano, versao]);   // eslint-disable-line
  const anos = [atual - 3, atual - 2, atual - 1, atual].map(String);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmentado pequeno rotulo="Exercício" valor={ano} aoMudar={setAno} opcoes={anos.map((a) => [a, a])} />
        {p.total > 0 && <span className="text-[13px] text-muted">Exercício {ano}: <strong className="text-credit">{p.entregues}</strong> entregues, <strong className="text-info">{p.emitidos}</strong> emitidos, <strong className="text-warn">{p.pendentes}</strong> pendentes</span>}
        <div className="flex-1" />
        <button type="button" className="btn-contorno btn-sm" onClick={() => setEmpresas(true)}>Empresas</button>
      </div>
      <div className="cartao overflow-hidden">
        {!lista.length ? <Vazio titulo="Nenhuma empresa cadastrada" texto="Cadastre as empresas (botão Empresas) ou carregue a demonstração para ver como fica." /> : (
          <div className="overflow-x-auto relative">
            <table className="w-full text-[13.5px]">
              <thead className="bg-surface-2 text-left text-[12px] uppercase tracking-wide text-muted">
                <tr><th className="px-3 py-2.5 font-semibold min-w-[200px]">Empresa</th>{DEMONSTRATIVOS.map((t) => <th key={t} className="px-3 py-2.5 font-semibold">{t}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lista.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2">
                    <td className="px-3 py-2 font-medium">{c.nome}</td>
                    {DEMONSTRATIVOS.map((t) => {
                      const st = ((dem[c.id] || {})[t] || {}).status || "";
                      return (
                        <td key={t} className="px-3 py-1.5">
                          <select value={st} onChange={(e) => svc.definirDemonstrativo(ano, c.id, t, e.target.value)} aria-label={t + " de " + c.nome}
                            className={"h-8 w-[150px] px-2 text-[13px] font-semibold rounded-full " + COR_DEMO[st]}>
                            {STATUS_DEMO.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {empresas && <JanelaEmpresas aoFechar={() => setEmpresas(false)} />}
    </div>
  );
}

export default function DepCadastro() {
  const { secao } = useParams();
  if (secao === "certidoes") return <Documentos grupo="certidoes" />;
  if (secao === "alvaras") return <Documentos grupo="alvaras" />;
  if (secao === "faturamentos") return <Faturamentos />;
  if (secao === "demonstrativos") return <Demonstrativos />;
  if (secao === "importar") return <Importar />;
  return <Navigate to="/departamento-cadastro/certidoes" replace />;
}
