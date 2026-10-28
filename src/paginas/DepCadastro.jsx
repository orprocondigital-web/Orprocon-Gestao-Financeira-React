import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Core } from "../lib/legado.js";
import { ALVARAS_GRADE, CERTIFICADO, DEMONSTRATIVOS, MESES, MODELOS_CERTIFICADO, NOME_CURTO_ALVARA, SITUACOES_ALVARA, STATUS_DEMO, TIPOS_ALVARAS, TIPOS_CERTIDOES, ehCertificado, grupoDoTipo, lerCertidao, linhasCertificados, nomeDoTipo, textoSituacao } from "../lib/depCadastro.mjs";
import { carregarXlsx } from "../lib/leitores.js";
import { abrirArquivo, apagarArquivo, guardarArquivo } from "../lib/arquivos.js";
import { textoDoPdf } from "../lib/leitores.js";
import Importar, { carregarDemo } from "../componentes/depCadastro/Importar.jsx";
import Empresas, { FormEmpresa } from "../componentes/depCadastro/Empresas.jsx";
import Mensagem from "../componentes/depCadastro/Mensagem.jsx";
import { useDepCadastro } from "../lib/useDepCadastro.js";
import { useEmDia } from "../lib/useEmDia.js";
import { useAvisos } from "../componentes/Avisos.jsx";
import Janela from "../componentes/Janela.jsx";
import Icone from "../componentes/Icone.jsx";
import { BotaoArquivo, Campo, Segmentado, Selo, dataBR, numero } from "../componentes/contabil/ui.jsx";

/*
 * Departamento Cadastro: Certidões e Alvarás (com vencimento), Faturamentos (por empresa e mês) e
 * Demonstrativos contábeis (por empresa e ano). Regras em src/lib/depCadastro.mjs.
 */
const SELO_SIT = { vencido: "erro", "7": "pendente", "30": "novo", ok: "ok", sem: "neutro", na: "neutro", andamento: "pendente" };

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

// ---------------------------------------------------------------- certidões e alvarás
function FormDocumento({ grupo, editando, aoFechar, tipoInicial, inicial }) {
  const [svc] = useDepCadastro();
  const { aviso } = useAvisos();
  const tipos = grupo === "alvaras" ? TIPOS_ALVARAS : TIPOS_CERTIDOES;
  const [f, setF] = useState(() => Object.assign({ clienteId: "", tipo: tipoInicial || tipos[0], modelo: tipoInicial === CERTIFICADO ? "A1" : "", sitAlvara: "", numero: "", emissao: "", vencimento: "", responsavel: "", link: "", observacoes: "" }, inicial || {}, editando || {}));
  const [erro, setErro] = useState("");
  const [pdf, setPdf] = useState(null);
  const muda = (c) => (e) => setF((x) => Object.assign({}, x, { [c]: e.target.value }));
  const anexar = async (file) => {
    setPdf(file);
    try {   // lê o PDF e preenche o que estiver vazio
      const r = lerCertidao(await textoDoPdf(file));
      const emp = svc.empresaPorDocumento(r.documento);
      setF((x) => Object.assign({}, x, {
        clienteId: x.clienteId || (emp ? emp.id : ""), tipo: editando ? x.tipo : (r.tipo || x.tipo), modelo: r.modelo || x.modelo,
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
    <Janela aberta titulo={tipoInicial === CERTIFICADO ? (editando ? "Editar certificado digital" : "Novo certificado digital") : inicial && inicial.empresa ? (editando ? "" : "Novo ") + f.tipo + " · " + inicial.empresa : (editando ? "Editar " : "Nova ") + (grupo === "alvaras" ? "alvará" : "certidão")} aoFechar={aoFechar} largura="max-w-[620px]"
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
        {ehCertificado(f.tipo) && (
          <Campo rotulo="Modelo do certificado" id="doc-modelo">
            <select id="doc-modelo" value={f.modelo || ""} onChange={muda("modelo")}>
              <option value="">Não sei</option>
              {MODELOS_CERTIFICADO.map((m) => <option key={m} value={m}>{m === "A1" ? "A1 (arquivo, 1 ano)" : "A3 (token ou cartão)"}</option>)}
            </select>
          </Campo>
        )}
        <Campo rotulo="Número" id="doc-num"><input id="doc-num" value={f.numero} onChange={muda("numero")} autoComplete="off" /></Campo>
        <Campo rotulo="Emissão" id="doc-em"><input id="doc-em" type="date" value={f.emissao} onChange={muda("emissao")} /></Campo>
        <Campo rotulo={grupoDoTipo(f.tipo) === "alvaras" ? "Vencimento (se tiver)" : "Vencimento"} id="doc-venc"><input id="doc-venc" type="date" value={f.vencimento} onChange={muda("vencimento")} /></Campo>
        {grupoDoTipo(f.tipo) === "alvaras" && (
          <Campo rotulo="Situação" id="doc-sit" dica="Sem data: diga a situação (dispensado, solicitado, vencido…).">
            <select id="doc-sit" value={f.sitAlvara || ""} onChange={muda("sitAlvara")}>{SITUACOES_ALVARA.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
          </Campo>
        )}
        <Campo rotulo="Responsável" id="doc-resp"><input id="doc-resp" value={f.responsavel} onChange={muda("responsavel")} autoComplete="off" /></Campo>
        <Campo rotulo="Link do arquivo (opcional)" id="doc-link"><input id="doc-link" value={f.link} onChange={muda("link")} placeholder="https://…" autoComplete="off" /></Campo>
        <Campo rotulo="Observações" id="doc-obs" className="sm:col-span-2"><input id="doc-obs" value={f.observacoes} onChange={muda("observacoes")} autoComplete="off" /></Campo>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2 text-[13px]">
          <BotaoArquivo className="btn-contorno btn-sm" aceita=".pdf" aoEscolher={anexar}>{pdf || (editando && editando.anexo) ? "Trocar o PDF" : "Anexar o PDF"}</BotaoArquivo>
          <span className="text-muted">{pdf ? pdf.name + " (os campos vazios foram preenchidos pelo PDF)" : editando && editando.anexo ? "Anexado: " + editando.anexo.nome : "Opcional. Ao anexar, o sistema lê tipo, CNPJ, datas e número."}</span>
        </div>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
      {!empresas.length && <p className="text-[13px] text-warn">Cadastre a empresa primeiro, em <Link to="/departamento-cadastro/empresas" className="underline">Empresas</Link>.</p>}
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
    <Janela aberta titulo={"Renovar: " + nomeDoTipo(doc)} aoFechar={aoFechar}
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
  const [mensagem, setMensagem] = useState(null);
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
        <Link to="/departamento-cadastro/empresas" className="btn-contorno btn-sm">Empresas</Link>
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
                    <td className="px-3 py-2 min-w-[150px]">{nomeDoTipo(d)}{(d.numero || d.link) && <span className="block text-[12px] text-muted">{d.numero}{d.link && <> {d.numero ? "· " : ""}<a href={d.link} target="_blank" rel="noopener noreferrer" className="text-brand underline">link</a></>}</span>}
                      {d.anexo && <button type="button" onClick={() => verPdf(d)} className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline" title={d.anexo.nome}>PDF</button>}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{d.vencimento ? dataBR(d.vencimento) : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><Selo tipo={SELO_SIT[d.situacao.status]}>{textoSituacao(d.situacao)}</Selo>{d.observacoes && <span className="block text-[12px] text-muted max-w-[220px] truncate" title={d.observacoes}>{d.observacoes}</span>}</td>
                    <td className="px-3 py-2">{d.responsavel}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-right">
                      <button type="button" className="btn-contorno btn-sm" onClick={() => setRenovando(d)}>Renovar</button>
                      <button type="button" className="btn-fantasma btn-sm" onClick={() => setMensagem(d)} title="Mensagem pronta para o cliente">Mensagem</button>
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
      {mensagem && <Mensagem doc={mensagem} aoFechar={() => setMensagem(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- alvarás: grade empresa × (municipal, sanitário, bombeiros)
const COR_ALV = {
  verde: "bg-ok-soft text-credit border-transparent", amarelo: "bg-warn-soft text-warn border-transparent", vermelho: "bg-debit-soft text-debit border-transparent",
  cinza: "bg-surface-2 text-muted border-transparent", branco: "bg-surface text-muted border-dashed border-line-strong"
};
const FILTROS_ALV = [["atencao", "Pedem atenção"], ["vermelho", "Vencidos"], ["amarelo", "Em andamento / vencendo"], ["branco", "Falta informar"], ["todos", "Todas"]];
const POR_PAGINA = 100;

function CelulaAlvara({ sit, doc, aoAbrir, rotulo }) {
  return (
    <button type="button" onClick={aoAbrir} aria-label={rotulo + ": " + sit.texto} title={doc && doc.observacoes ? doc.observacoes : sit.texto}
      className={"w-full min-w-[128px] text-left rounded-lg border px-2.5 py-1.5 hover:brightness-95 transition " + COR_ALV[sit.cor]}>
      <span className="block text-[12.5px] font-semibold leading-tight">{sit.texto}</span>
      <span className="block text-[11.5px] tabular-nums opacity-80 leading-tight">{doc && doc.vencimento ? dataBR(doc.vencimento) : sit.cor === "branco" ? "clique para cadastrar" : "sem data"}{doc && doc.observacoes ? " · obs." : ""}</span>
    </button>
  );
}

function Alvaras() {
  const [svc, versao] = useDepCadastro();
  const { aviso } = useAvisos();
  const g = useMemo(() => svc.gradeAlvaras(), [svc, versao]);   // eslint-disable-line
  const [modo, setModo] = useState("grade");
  const [filtro, setFiltro] = useState("atencao");
  const [busca, setBusca] = useState("");
  const [resp, setResp] = useState("");
  const [cidade, setCidade] = useState("");
  const [limite, setLimite] = useState(POR_PAGINA);
  const [form, setForm] = useState(null);   // { editando, inicial }
  const [renovando, setRenovando] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  useEffect(() => { setLimite(POR_PAGINA); }, [filtro, busca, resp, cidade]);
  const responsaveis = useMemo(() => [...new Set(g.linhas.map((l) => l.responsavel).filter(Boolean))].sort(), [g]);
  const cidades = useMemo(() => [...new Set(g.linhas.map((l) => l.empresa.cidade).filter(Boolean))].sort(), [g]);
  if (modo === "lista") return (
    <div className="space-y-3">
      <Segmentado pequeno rotulo="Ver como" valor={modo} aoMudar={setModo} opcoes={[["grade", "Grade por empresa"], ["lista", "Lista de alvarás"]]} />
      <Documentos grupo="alvaras" />
    </div>
  );
  const b = busca.trim().toLowerCase(), bDig = busca.replace(/\D/g, "");
  const visiveis = g.linhas.filter((l) => {
    const cores = ALVARAS_GRADE.map((t) => l.situacoes[t].cor);
    if (filtro === "atencao" && !cores.some((c) => c === "vermelho" || c === "amarelo")) return false;
    if (filtro !== "atencao" && filtro !== "todos" && !cores.includes(filtro)) return false;
    if (resp && l.responsavel !== resp) return false;
    if (cidade && l.empresa.cidade !== cidade) return false;
    if (!b) return true;
    return String(l.empresa.nome).toLowerCase().indexOf(b) > -1 || (bDig.length >= 3 && String(l.empresa.documento || "").replace(/\D/g, "").indexOf(bDig) > -1) || String(l.empresa.cidade || "").toLowerCase().indexOf(b) > -1;
  });
  const abrir = (l, t) => {
    const d = l.alvaras[t];
    if (d) setForm({ editando: d, inicial: { empresa: l.empresa.nome } });
    else setForm({ editando: null, inicial: { clienteId: l.empresa.id, tipo: t, empresa: l.empresa.nome, responsavel: l.responsavel } });
  };
  const baixar = async () => {
    try {
      const XLSX = await carregarXlsx();
      const cel = (l, t) => { const d = l.alvaras[t], s = l.situacoes[t]; return [d && d.vencimento ? dataBR(d.vencimento) : "", s.texto, d ? d.observacoes || "" : ""]; };
      const cab = ["Empresa", "CNPJ", "Cidade", "UF", "Responsável", "Envio das taxas"];
      ALVARAS_GRADE.forEach((t) => { const n = NOME_CURTO_ALVARA[t]; cab.push(n + " - vencimento", n + " - situação", n + " - obs."); });
      const linhas = [cab].concat(visiveis.map((l) => [l.empresa.nome, l.empresa.documento || "", l.empresa.cidade || "", l.empresa.uf || "", l.responsavel, l.empresa.envioTaxas || ""]
        .concat(...ALVARAS_GRADE.map((t) => cel(l, t)))));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(linhas);
      ws["!cols"] = [{ wch: 40 }, { wch: 20 }, { wch: 18 }, { wch: 4 }, { wch: 14 }, { wch: 24 }].concat(ALVARAS_GRADE.flatMap(() => [{ wch: 12 }, { wch: 22 }, { wch: 28 }]));
      XLSX.utils.book_append_sheet(wb, ws, "Alvarás");
      XLSX.writeFile(wb, "alvaras-" + svc.hoje() + ".xlsx");
    } catch (e) { aviso("Não consegui gerar o Excel: " + (e.message || e)); }
  };
  const cartoes = [["vermelho", "Vencidos / débitos", g.vermelho, "text-debit"], ["amarelo", "Em andamento / vencendo", g.amarelo, "text-warn"], ["branco", "Falta informar", g.branco, "text-ink-2"],
    ["todos", "Em dia", g.verde, "text-credit"], ["todos", "Não se aplica", g.cinza, "text-muted"]];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cartoes.map(([f, t, n, cor]) => (
          <button key={t} type="button" onClick={() => setFiltro(f)} className="cartao px-4 py-3 text-left hover:border-brand-fill transition-colors">
            <div className="text-[12.5px] text-muted">{t}</div><div className={"text-[24px] font-semibold tabular-nums " + (n ? cor : "text-muted")}>{numero(n)}</div>
          </button>
        ))}
      </div>
      <p className="text-[12.5px] text-muted -mt-2">Contagem de alvarás ({numero(g.linhas.length)} empresas × municipal, sanitário e bombeiros). Clique num número para filtrar.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Segmentado pequeno rotulo="Mostrar" valor={filtro} aoMudar={setFiltro} opcoes={FILTROS_ALV} />
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Empresa, CNPJ ou cidade…" aria-label="Buscar empresa, CNPJ ou cidade" className="max-w-[260px] h-9" />
        {responsaveis.length > 0 && <select value={resp} onChange={(e) => setResp(e.target.value)} aria-label="Responsável" className="h-9 max-w-[170px]"><option value="">Todos os responsáveis</option>{responsaveis.map((x) => <option key={x} value={x}>{x}</option>)}</select>}
        {cidades.length > 1 && <select value={cidade} onChange={(e) => setCidade(e.target.value)} aria-label="Cidade" className="h-9 max-w-[170px]"><option value="">Todas as cidades</option>{cidades.map((x) => <option key={x} value={x}>{x}</option>)}</select>}
        <div className="flex-1" />
        <Segmentado pequeno rotulo="Ver como" valor={modo} aoMudar={setModo} opcoes={[["grade", "Grade"], ["lista", "Lista"]]} />
        <button type="button" className="btn-contorno btn-sm" onClick={baixar} disabled={!visiveis.length}>Baixar Excel</button>
      </div>
      <div className="cartao overflow-hidden">
        {!g.linhas.length ? <Vazio titulo="Nenhuma empresa cadastrada" texto="Importe a planilha de renovação de alvarás (colunas Municipal, Sanitário e Bombeiro) ou a lista de empresas, ou carregue a demonstração." />
        : !visiveis.length ? <div className="p-10 text-center"><strong className="block text-[15px]">Nada com esse filtro</strong><span className="text-muted text-[13.5px]">Escolha Todas para ver a lista inteira.</span></div>
        : (
          <div className="overflow-x-auto relative">
            <table className="w-full text-[13.5px]">
              <thead className="bg-surface-2 text-left text-[12px] uppercase tracking-wide text-muted">
                <tr><th className="px-3 py-2.5 font-semibold min-w-[220px]">Empresa</th>{ALVARAS_GRADE.map((t) => <th key={t} className="px-2 py-2.5 font-semibold">{NOME_CURTO_ALVARA[t]}</th>)}
                  <th className="px-3 py-2.5 font-semibold">Responsável</th><th className="px-3 py-2.5 font-semibold">Envio das taxas</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visiveis.slice(0, limite).map((l) => (
                  <tr key={l.empresa.id} className="align-top hover:bg-surface-2/60">
                    <td className="px-3 py-2"><Link to={"/departamento-cadastro/buscar?empresa=" + l.empresa.id} className="font-medium hover:text-brand hover:underline">{l.empresa.nome}</Link>
                      <span className="block text-[12px] text-muted tabular-nums">{[l.empresa.documento, [l.empresa.cidade, l.empresa.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ")}</span></td>
                    {ALVARAS_GRADE.map((t) => <td key={t} className="px-1.5 py-1.5"><CelulaAlvara sit={l.situacoes[t]} doc={l.alvaras[t]} rotulo={NOME_CURTO_ALVARA[t] + " de " + l.empresa.nome} aoAbrir={() => abrir(l, t)} /></td>)}
                    <td className="px-3 py-2 whitespace-nowrap">{l.responsavel}</td>
                    <td className="px-3 py-2 text-[12.5px] text-ink-2 max-w-[200px]">{l.empresa.envioTaxas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visiveis.length > limite && (
              <div className="p-3 text-center border-t border-line"><button type="button" className="btn-contorno btn-sm" onClick={() => setLimite((n) => n + POR_PAGINA)}>Mostrar mais ({numero(visiveis.length - limite)} restantes)</button></div>
            )}
          </div>
        )}
      </div>
      <p className="text-[12.5px] text-muted">Clique num alvará para cadastrar ou mudar a situação, a data e a observação. Para renovar com histórico e anexar o PDF, use a Lista.</p>
      {form && <FormDocumento grupo="alvaras" editando={form.editando} inicial={form.inicial} aoFechar={() => setForm(null)} />}
      {renovando && <Renovar doc={renovando} aoFechar={() => setRenovando(null)} />}
      {mensagem && <Mensagem doc={mensagem} aoFechar={() => setMensagem(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- buscar empresa (CNPJ) e ficha
function Bloco({ titulo, acao, children, className = "" }) {
  return (
    <section className={"cartao overflow-hidden " + className}>
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-line bg-surface-2"><h3 className="text-[14px] font-semibold flex-1">{titulo}</h3>{acao}</header>
      <div className="p-4">{children}</div>
    </section>
  );
}
const Linha = ({ rotulo, children }) => (children ? <div className="flex gap-3 text-[13.5px] py-1"><span className="w-[130px] shrink-0 text-muted">{rotulo}</span><span className="min-w-0 break-words">{children}</span></div> : null);
const mesCurto = (m) => MESES[Number(m.slice(5)) - 1] + "/" + m.slice(2, 4);
const NOME_DEMO = Object.fromEntries(STATUS_DEMO.map((s) => [s.id, s.nome]));

function Ficha({ id, aoVoltar }) {
  const [svc, versao] = useDepCadastro();
  const [emDia] = useEmDia();
  const f = useMemo(() => svc.fichaEmpresa(id), [svc, id, versao]);   // eslint-disable-line
  const [editar, setEditar] = useState(false);
  const [form, setForm] = useState(null);
  const [renovando, setRenovando] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  if (!f) return <div className="cartao p-8 text-center"><strong>Empresa não encontrada.</strong> <button type="button" className="btn-fantasma btn-sm" onClick={aoVoltar}>Voltar à busca</button></div>;
  const c = f.empresa;
  const setores = emDia.setores();
  const maxFat = Math.max(1, ...f.faturamento.meses.map((x) => x.valor || 0));
  const docLinha = (d) => (
    <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
      <span className="flex-1 min-w-[150px] text-[13.5px]">{nomeDoTipo(d)}{d.observacoes && <span className="block text-[12px] text-muted truncate" title={d.observacoes}>{d.observacoes}</span>}</span>
      <span className="text-[13px] tabular-nums text-muted w-[84px]">{d.vencimento ? dataBR(d.vencimento) : "—"}</span>
      <Selo tipo={SELO_SIT[d.situacao.status]}>{textoSituacao(d.situacao)}</Selo>
      <span className="whitespace-nowrap">
        <button type="button" className="btn-fantasma btn-sm" onClick={() => setRenovando(d)} disabled={!d.vencimento}>Renovar</button>
        <button type="button" className="btn-fantasma btn-sm" onClick={() => setMensagem(d)}>Mensagem</button>
      </span>
    </li>
  );
  return (
    <div className="space-y-4">
      <div className="cartao px-5 py-4 flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[260px]">
          <h2 className="text-[20px] font-semibold leading-tight">{c.nome}</h2>
          <p className="text-[13.5px] text-ink-2 tabular-nums mt-0.5">{[c.documento || "sem CNPJ/CPF", c.codigo && "cód. " + c.codigo, c.regime, [c.cidade, c.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ")}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {c.baixa && <Selo tipo="erro">Baixada em {dataBR(c.baixa)}</Selo>}
            {f.matriz && <Link to={"/departamento-cadastro/buscar?empresa=" + f.matriz.id}><Selo tipo="neutro">Filial de {f.matriz.nome} →</Selo></Link>}
            {c.filial && !f.matriz && <Selo tipo="neutro">Filial (matriz não cadastrada)</Selo>}
            {f.filiais.length > 0 && <Selo tipo="novo">Matriz · {f.filiais.length} filial(is)</Selo>}
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-fantasma btn-sm" onClick={aoVoltar}>← Nova busca</button>
          <button type="button" className="btn-contorno btn-sm" onClick={() => setEditar(true)}>Editar empresa</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Bloco titulo="Alvarás">
          <div className="grid grid-cols-3 gap-2">
            {ALVARAS_GRADE.map((t) => (
              <div key={t}><div className="text-[12px] text-muted mb-1">{NOME_CURTO_ALVARA[t]}</div>
                <CelulaAlvara sit={f.alvaras[t].situacao} doc={f.alvaras[t].doc} rotulo={NOME_CURTO_ALVARA[t]}
                  aoAbrir={() => setForm(f.alvaras[t].doc ? { grupo: "alvaras", editando: f.alvaras[t].doc, inicial: { empresa: c.nome } } : { grupo: "alvaras", editando: null, inicial: { clienteId: c.id, tipo: t, empresa: c.nome } })} /></div>
            ))}
          </div>
          {f.outrosAlvaras.length > 0 && <ul className="divide-y divide-line mt-3">{f.outrosAlvaras.map(docLinha)}</ul>}
          {c.envioTaxas && <p className="text-[12.5px] text-muted mt-3">Envio das taxas: <span className="text-ink-2">{c.envioTaxas}</span></p>}
        </Bloco>

        <Bloco titulo="Certidões e certificado digital" acao={<button type="button" className="btn-fantasma btn-sm" onClick={() => setForm({ grupo: "certidoes", editando: null, inicial: { clienteId: c.id } })}><Icone nome="mais" />Nova</button>}>
          {!f.certidoes.length && !f.certificados.length ? <p className="text-[13px] text-muted">Nenhuma certidão ou certificado cadastrado.</p>
            : <ul className="divide-y divide-line -my-1.5">{f.certificados.concat(f.certidoes).map(docLinha)}</ul>}
        </Bloco>

        <Bloco titulo="Dados e contato">
          <Linha rotulo="Segmento">{c.segmento}</Linha>
          <Linha rotulo="Contato">{c.contato}</Linha>
          <Linha rotulo="Telefone">{c.telefone}</Linha>
          <Linha rotulo="E-mail">{c.email}</Linha>
          <Linha rotulo="Cliente">{c.inicio || c.saida ? (c.inicio ? "desde " + c.inicio.split("-").reverse().join("/") : "") + (c.saida ? " · saiu " + c.saida.split("-").reverse().join("/") : "") : ""}</Linha>
          <Linha rotulo="Lucro Real">{c.regime === "Lucro Real" ? c.tipoLucroReal || "falta: trimestral ou anual" : ""}</Linha>
          <Linha rotulo="Observações">{c.obs}</Linha>
          {!c.segmento && !c.contato && !c.telefone && !c.email && !c.obs && <p className="text-[13px] text-muted">Sem contato cadastrado. Em Editar empresa dá para incluir, e a mensagem de renovação sai com o nome e o WhatsApp.</p>}
          {f.filiais.length > 0 && <div className="mt-2 text-[13px]"><span className="text-muted">Filiais: </span>{f.filiais.map((x, i) => <span key={x.id}>{i ? ", " : ""}<Link className="text-brand hover:underline" to={"/departamento-cadastro/buscar?empresa=" + x.id}>{x.documento || x.nome}{x.cidade ? " (" + x.cidade + ")" : ""}</Link></span>)}</div>}
        </Bloco>

        <Bloco titulo="Responsáveis e sócios">
          {setores.map((s) => <Linha key={s.id} rotulo={s.nome}>{emDia.responsavel(s.id, c.id) || <span className="text-muted">—</span>}</Linha>)}
          {f.responsavelAlvaras && <Linha rotulo="Alvarás">{f.responsavelAlvaras}</Linha>}
          <div className="mt-2 pt-2 border-t border-line">
            {c.socios && c.socios.length ? c.socios.map((x, i) => <Linha key={i} rotulo={x.percentual ? x.percentual + "%" : "Sócio"}>{x.nome}{c.sociosDaMatriz ? " (da matriz)" : ""}</Linha>)
              : <p className="text-[13px] text-muted">Sem sócios cadastrados.</p>}
          </div>
        </Bloco>

        <Bloco titulo={"Faturamento: últimos 12 meses"} className="lg:col-span-2" acao={<Link to="/departamento-cadastro/faturamentos" className="btn-fantasma btn-sm">Abrir faturamentos</Link>}>
          {!f.faturamento.comValor ? <p className="text-[13px] text-muted">Sem faturamento lançado nos últimos 12 meses.</p> : (<>
            <div className="flex items-end gap-1.5 h-[120px]" role="img" aria-label={"Faturamento dos últimos 12 meses, total " + Core.formatBR(f.faturamento.total)}>
              {f.faturamento.meses.map((x) => (
                <div key={x.mes} className="flex-1 flex flex-col items-center justify-end h-full gap-1" title={mesCurto(x.mes) + ": " + (x.valor === null ? "sem lançamento" : "R$ " + Core.formatBR(x.valor))}>
                  <div className={"w-full rounded-t " + (x.valor === null ? "bg-line h-[2px]" : "bg-brand-fill")} style={x.valor === null ? undefined : { height: Math.max(3, (x.valor / maxFat) * 96) + "px" }} />
                  <span className="text-[10.5px] text-muted">{mesCurto(x.mes)}</span>
                </div>
              ))}
            </div>
            <p className="text-[13px] mt-2">Total em 12 meses: <strong className="tabular-nums">R$ {Core.formatBR(f.faturamento.total)}</strong> <span className="text-muted">({f.faturamento.comValor} de 12 meses lançados)</span></p>
          </>)}
          <p className="text-[13px] mt-3 pt-3 border-t border-line"><span className="text-muted">Demonstrativos de {f.demonstrativos.exercicio}: </span>
            {f.demonstrativos.itens.map((x, i) => <span key={x.tipo}>{i ? " · " : ""}{x.tipo}: <strong className={x.status === "entregue" ? "text-credit" : x.status ? "" : "text-warn"}>{NOME_DEMO[x.status] || "pendente"}</strong></span>)}</p>
        </Bloco>
      </div>
      {editar && <FormEmpresa editando={c} aoFechar={() => setEditar(false)} />}
      {form && <FormDocumento grupo={form.grupo} editando={form.editando} inicial={form.inicial} aoFechar={() => setForm(null)} />}
      {renovando && <Renovar doc={renovando} aoFechar={() => setRenovando(null)} />}
      {mensagem && <Mensagem doc={mensagem} aoFechar={() => setMensagem(null)} />}
    </div>
  );
}

function Buscar() {
  const [svc, versao] = useDepCadastro();
  const [params, setParams] = useSearchParams();
  const id = params.get("empresa");
  const [texto, setTexto] = useState("");
  const achados = useMemo(() => svc.buscarEmpresas(texto), [svc, texto, versao]);   // eslint-disable-line
  const abrir = (c) => setParams({ empresa: c.id });
  if (id) return <Ficha id={id} aoVoltar={() => setParams({})} />;
  const total = svc.empresas().length;
  return (
    <div className="space-y-4 max-w-[860px]">
      <div className="cartao p-5">
        <label htmlFor="busca-emp" className="block text-[15px] font-semibold mb-1">Buscar empresa</label>
        <p className="text-[13px] text-muted mb-3">Digite o CNPJ (com ou sem pontos, inteiro ou parte), o código ou o nome. Abre a ficha com alvarás, certidões, certificado, contato, responsáveis e faturamento.</p>
        <input id="busca-emp" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} data-foco autoFocus autoComplete="off"
          onKeyDown={(e) => { if (e.key === "Enter" && achados.length) abrir(achados[0]); }}
          placeholder="Ex.: 11.111.111/0001-11, 11111111, Alfa…" className="h-12 text-[16px]" />
        {texto.trim() && <p className="text-[12.5px] text-muted mt-2">{achados.length ? achados.length + (achados.length === 30 ? "+" : "") + " empresa(s). Enter abre a primeira." : "Nenhuma empresa encontrada."}</p>}
      </div>
      {achados.length > 0 && (
        <ul className="cartao divide-y divide-line overflow-hidden">
          {achados.map((c) => (
            <li key={c.id}><button type="button" onClick={() => abrir(c)} className="w-full text-left px-4 py-2.5 hover:bg-surface-2 flex flex-wrap items-baseline gap-x-3">
              <strong className="font-medium flex-1 min-w-[200px]">{c.nome}</strong>
              <span className="text-[13px] text-muted tabular-nums">{[c.documento, c.codigo && "cód. " + c.codigo, [c.cidade, c.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ")}</span>
              {c.filial && <Selo tipo="neutro">Filial</Selo>}
            </button></li>
          ))}
        </ul>
      )}
      {!texto.trim() && <p className="text-[13px] text-muted">{total ? total + " empresa(s) cadastradas." : <>Nenhuma empresa ainda. <Link to="/departamento-cadastro/importar" className="underline">Importe a planilha</Link> ou cadastre em Empresas.</>}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- painel de certificados digitais
function GrupoCert({ titulo, cor, lista, aoRenovar, aoEditar, aoMensagem, vazio }) {
  return (
    <section className="cartao overflow-hidden" aria-label={titulo}>
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-line bg-surface-2">
        <strong className={"text-[14px] " + cor}>{titulo}</strong><span className="text-[13px] text-muted">({numero(lista.length)})</span>
      </header>
      {!lista.length ? <p className="px-4 py-3 text-[13px] text-muted">{vazio}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <tbody className="divide-y divide-line">
              {lista.map((d) => (
                <tr key={d.id} className="hover:bg-surface-2">
                  <td className="px-4 py-2 font-medium min-w-[200px]">{d.empresa}<span className="block text-[12px] text-muted tabular-nums">{d.cnpj}</span></td>
                  <td className="px-3 py-2 w-[70px]">{d.modelo ? <Selo tipo={d.modelo === "A3" ? "novo" : "neutro"}>{d.modelo}</Selo> : <span className="text-muted text-[12px]">sem modelo</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{dataBR(d.vencimento)}</td>
                  <td className="px-3 py-2 whitespace-nowrap"><Selo tipo={SELO_SIT[d.situacao.status]}>{textoSituacao(d.situacao)}</Selo></td>
                  <td className="px-3 py-2">{d.responsavel}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-right">
                    <button type="button" className="btn-contorno btn-sm" onClick={() => aoRenovar(d)}>Renovar</button>
                    <button type="button" className="btn-fantasma btn-sm" onClick={() => aoMensagem(d)} title="Mensagem pronta para o cliente">Mensagem</button>
                    <button type="button" className="btn-fantasma btn-sm" onClick={() => aoEditar(d)}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Certificados() {
  const [svc, versao] = useDepCadastro();
  const { aviso } = useAvisos();
  const g = useMemo(() => svc.certificados(), [svc, versao]);   // eslint-disable-line
  const [modelo, setModelo] = useState("todos");
  const [mensagem, setMensagem] = useState(null);
  const [form, setForm] = useState(null);
  const [renovando, setRenovando] = useState(null);
  const filtra = (l) => (modelo === "todos" ? l : l.filter((d) => (d.modelo || "") === (modelo === "sem" ? "" : modelo)));
  const baixar = async () => {
    try {
      const XLSX = await carregarXlsx();
      const wb = XLSX.utils.book_new();
      [["Vencidos", g.vencidos], ["Vencem em 30 dias", g.ate30], ["Em dia", g.emDia.concat(g.semData)]].forEach(([nome, l]) => {
        const ws = XLSX.utils.aoa_to_sheet(linhasCertificados(filtra(l)));
        ws["!cols"] = [{ wch: 40 }, { wch: 20 }, { wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, ws, nome);
      });
      XLSX.writeFile(wb, "certificados-digitais-" + svc.hoje() + ".xlsx");
    } catch (e) { aviso("Não consegui gerar o Excel: " + (e.message || e)); }
  };
  const cartoes = [["Vencidos", g.vencidos.length, "text-debit"], ["Vencem em até 30 dias", g.ate30.length, "text-warn"], ["Em dia", g.emDia.length, "text-credit"], ["A1 / A3", g.A1 + " / " + g.A3, "text-ink"]];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cartoes.map(([t, n, cor]) => (
          <div key={t} className="cartao px-4 py-3"><div className="text-[12.5px] text-muted">{t}</div><div className={"text-[24px] font-semibold tabular-nums " + (n ? cor : "text-muted")}>{typeof n === "number" ? numero(n) : n}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmentado pequeno rotulo="Modelo" valor={modelo} aoMudar={setModelo} opcoes={[["todos", "Todos"], ["A1", "A1"], ["A3", "A3"]].concat(g.semModelo ? [["sem", "Sem modelo (" + g.semModelo + ")"]] : [])} />
        <div className="flex-1" />
        <button type="button" className="btn-contorno btn-sm" onClick={baixar} disabled={!g.lista.length}>Baixar Excel</button>
        <button type="button" className="btn-primario btn-sm" onClick={() => setForm({ editando: null })}><Icone nome="mais" />Novo certificado</button>
      </div>
      {!g.lista.length ? (
        <div className="cartao"><Vazio titulo="Nenhum certificado digital cadastrado" texto="Cadastre em Novo certificado, importe os PDFs ou uma planilha (com a coluna Modelo A1/A3), ou carregue a demonstração." /></div>
      ) : (
        <>
          <GrupoCert titulo="Vencidos" cor="text-debit" lista={filtra(g.vencidos)} aoRenovar={setRenovando} aoEditar={(d) => setForm({ editando: d })} aoMensagem={setMensagem} vazio="Nenhum certificado vencido." />
          <GrupoCert titulo="Vencem em até 30 dias" cor="text-warn" lista={filtra(g.ate30)} aoRenovar={setRenovando} aoEditar={(d) => setForm({ editando: d })} aoMensagem={setMensagem} vazio="Nenhum vence nos próximos 30 dias." />
          <GrupoCert titulo="Em dia" cor="text-credit" lista={filtra(g.emDia.concat(g.semData))} aoRenovar={setRenovando} aoEditar={(d) => setForm({ editando: d })} aoMensagem={setMensagem} vazio="Nenhum certificado em dia." />
        </>
      )}
      <p className="text-[12.5px] text-muted">Os certificados também aparecem em Certidões. O Excel sai com uma aba para cada grupo, para o Societário cobrar a renovação.</p>
      {form && <FormDocumento grupo="certidoes" editando={form.editando} tipoInicial={CERTIFICADO} aoFechar={() => setForm(null)} />}
      {mensagem && <Mensagem doc={mensagem} aoFechar={() => setMensagem(null)} />}
      {renovando && <Renovar doc={renovando} aoFechar={() => setRenovando(null)} />}
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
        <Link to="/departamento-cadastro/empresas" className="btn-contorno btn-sm">Empresas</Link>
      </div>
      <div className="cartao overflow-hidden">
        {!lista.length ? <Vazio titulo="Nenhuma empresa cadastrada" texto="Cadastre as empresas (em Empresas), importe uma planilha de faturamento ou carregue a demonstração." /> : (
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
    </div>
  );
}

// ---------------------------------------------------------------- demonstrativos
const COR_DEMO = { "": "border-warn/40 bg-warn-soft text-warn", emitido: "border-info/40 bg-info-soft text-info", entregue: "border-credit/40 bg-ok-soft text-credit", nao_se_aplica: "border-line bg-surface-2 text-muted" };
function Demonstrativos() {
  const [svc, versao] = useDepCadastro();
  const atual = new Date().getFullYear();
  const [ano, setAno] = useState(String(atual - 1));
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
        <Link to="/departamento-cadastro/empresas" className="btn-contorno btn-sm">Empresas</Link>
      </div>
      <div className="cartao overflow-hidden">
        {!lista.length ? <Vazio titulo="Nenhuma empresa cadastrada" texto="Cadastre as empresas (em Empresas) ou carregue a demonstração para ver como fica." /> : (
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
    </div>
  );
}

export default function DepCadastro() {
  const { secao } = useParams();
  if (secao === "empresas") return <Empresas />;
  if (secao === "buscar") return <Buscar />;
  if (secao === "certidoes") return <Documentos grupo="certidoes" />;
  if (secao === "certificados") return <Certificados />;
  if (secao === "alvaras") return <Alvaras />;
  if (secao === "faturamentos") return <Faturamentos />;
  if (secao === "demonstrativos") return <Demonstrativos />;
  if (secao === "importar") return <Importar />;
  return <Navigate to="/departamento-cadastro/certidoes" replace />;
}
