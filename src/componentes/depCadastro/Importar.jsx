import { useState } from "react";
import { Link } from "react-router-dom";
import { Core, Inicio } from "../../lib/legado.js";
import { TIPOS_ALVARAS, TIPOS_CERTIDOES, chaveNome, grupoDoTipo, lerCertidao, lerPlanilhaCadastro, MESES } from "../../lib/depCadastro.mjs";
import { useDepCadastro } from "../../lib/useDepCadastro.js";
import { emDia } from "../../lib/useEmDia.js";
import { carregarXlsx, lerPlanilha, textoDoPdf } from "../../lib/leitores.js";
import { apagarTodos, guardarArquivo } from "../../lib/arquivos.js";
import { useAvisos } from "../Avisos.jsx";
import { BotaoArquivo, Mensagem, numero } from "../contabil/ui.jsx";

/*
 * Departamento Cadastro › Importar e demonstração: PDFs de certidões e alvarás (lê tipo, CNPJ, emissão,
 * validade e número para conferir antes de salvar), planilha do Excel e os dados de demonstração.
 */
const TODOS_TIPOS = TIPOS_CERTIDOES.concat(TIPOS_ALVARAS);

/** Carrega a demonstração (empresas, certidões, alvarás, faturamento e demonstrativos fictícios). */
export function carregarDemo(svc) {
  return svc.carregarDemonstracao(Inicio.vencimentosExemplo(svc.hoje()));
}

function Pdfs() {
  const [svc] = useDepCadastro();
  const { aviso } = useAvisos();
  const [linhas, setLinhas] = useState([]);
  const [status, setStatus] = useState("");
  const empresas = svc.empresas();
  const ler = async (files) => {
    setStatus("Lendo " + files.length + " PDF(s)…"); setLinhas([]);
    const lidos = [];
    for (const f of files) {
      try {
        const texto = await textoDoPdf(f);
        if (!texto.trim()) { lidos.push({ arquivo: f, erro: "PDF digitalizado (imagem): preencha à mão.", tipo: "", clienteId: "", vencimento: "", emissao: "", numero: "", documento: "", marcado: true }); continue; }
        const r = lerCertidao(texto);
        const emp = svc.empresaPorDocumento(r.documento) || (r.nome && svc.empresas().find((c) => chaveNome(c.nome) === chaveNome(r.nome))) || null;
        lidos.push(Object.assign({ arquivo: f, clienteId: emp ? emp.id : "", marcado: true }, r));
      } catch (e) { lidos.push({ arquivo: f, erro: "Não consegui ler: " + (e.message || e), tipo: "", clienteId: "", vencimento: "", emissao: "", numero: "", documento: "", marcado: false }); }
    }
    setLinhas(lidos); setStatus("");
  };
  const muda = (i, campo, v) => setLinhas((l) => l.map((x, k) => (k === i ? Object.assign({}, x, { [campo]: v }) : x)));
  const escolherEmpresa = (i, v) => {
    if (v !== "nova") { muda(i, "clienteId", v); return; }
    const l = linhas[i];   // cadastra com o nome e o CNPJ lidos do PDF; as outras linhas com o mesmo CNPJ já ficam com ela
    try {
      const c = svc.salvarEmpresa({ nome: l.nome, documento: l.documento });
      const dig = (x) => String(x || "").replace(/\D/g, "");
      setLinhas((ls) => ls.map((x) => (x === l || (dig(x.documento) && dig(x.documento) === dig(l.documento) && !x.clienteId) ? Object.assign({}, x, { clienteId: c.id }) : x)));
      aviso("Empresa cadastrada: " + c.nome);
    } catch (e) { aviso(e.message); }
  };
  const salvar = async () => {
    let ok = 0;
    const erros = [];
    for (const l of linhas.filter((x) => x.marcado)) {
      try {
        const d = svc.salvarDocumento({ clienteId: l.clienteId, tipo: l.tipo, vencimento: l.vencimento, emissao: l.emissao, numero: l.numero });
        await guardarArquivo(d.id, l.arquivo);
        svc.marcarAnexo(d.id, { nome: l.arquivo.name, tamanho: l.arquivo.size });
        ok++;
      } catch (e) { erros.push(l.arquivo.name + ": " + e.message); }
    }
    setLinhas((ls) => ls.filter((l) => !l.marcado || erros.some((e) => e.indexOf(l.arquivo.name + ":") === 0)));
    setStatus(erros.length ? "Faltou corrigir: " + erros.join(" · ") : "");
    if (ok) aviso(ok + " documento(s) salvos com o PDF anexado.");
  };
  const marcados = linhas.filter((l) => l.marcado).length;
  return (
    <section className="cartao p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[240px]">
          <h2 className="text-[16px] font-semibold">Certidões e alvarás em PDF</h2>
          <p className="text-[13px] text-muted">Escolha um ou mais PDFs. O sistema lê o tipo, o CNPJ, a emissão, a validade e o número; você confere e salva. O PDF fica anexado ao documento.</p>
        </div>
        <BotaoArquivo className="btn-primario" aceita=".pdf" multiplo aoEscolher={ler}>Escolher PDFs</BotaoArquivo>
      </div>
      {status && <Mensagem texto={status} tipo={/Faltou/.test(status) ? "aviso" : "info"} />}
      {linhas.length > 0 && (<>
        <div className="overflow-x-auto relative border border-line rounded-lg">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 text-left text-[12px] uppercase tracking-wide text-muted">
              <tr><th className="px-2 py-2" /><th className="px-2 py-2 font-semibold">Arquivo</th><th className="px-2 py-2 font-semibold">Empresa</th><th className="px-2 py-2 font-semibold">Tipo</th>
                <th className="px-2 py-2 font-semibold">Emissão</th><th className="px-2 py-2 font-semibold">Vencimento</th><th className="px-2 py-2 font-semibold">Número</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {linhas.map((l, i) => (
                <tr key={i} className="align-top">
                  <td className="px-2 py-2"><input type="checkbox" checked={l.marcado} onChange={(e) => muda(i, "marcado", e.target.checked)} aria-label={"Importar " + l.arquivo.name} /></td>
                  <td className="px-2 py-2 max-w-[180px] break-all">{l.arquivo.name}{l.erro && <span className="block text-[12px] text-warn">{l.erro}</span>}{l.documento && <span className="block text-[12px] text-muted">{l.documento}</span>}</td>
                  <td className="px-2 py-1.5 min-w-[190px]">
                    <select value={l.clienteId} onChange={(e) => escolherEmpresa(i, e.target.value)} className={"h-9 text-[13px] " + (l.clienteId ? "" : "border-warn")}>
                      <option value="">{l.documento ? "CNPJ não cadastrado: escolha…" : "Escolha…"}</option>
                      {!l.clienteId && l.nome && <option value="nova">+ Cadastrar {l.nome}</option>}
                      {empresas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 min-w-[170px]"><input list="imp-tipos" value={l.tipo} onChange={(e) => muda(i, "tipo", e.target.value)} className={"h-9 text-[13px] " + (l.tipo ? "" : "border-warn")} />
                    {l.tipo && <span className="block text-[11.5px] text-muted mt-0.5">vai para {grupoDoTipo(l.tipo) === "alvaras" ? "Alvarás" : "Certidões"}</span>}</td>
                  <td className="px-2 py-1.5"><input type="date" value={l.emissao} onChange={(e) => muda(i, "emissao", e.target.value)} className="h-9 text-[13px] w-[150px]" /></td>
                  <td className="px-2 py-1.5"><input type="date" value={l.vencimento} onChange={(e) => muda(i, "vencimento", e.target.value)} className={"h-9 text-[13px] w-[150px] " + (l.vencimento ? "" : "border-warn")} /></td>
                  <td className="px-2 py-1.5"><input value={l.numero} onChange={(e) => muda(i, "numero", e.target.value)} className="h-9 text-[13px] w-[160px]" /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="imp-tipos">{TODOS_TIPOS.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted flex-1">Campos em laranja precisam ser preenchidos. A empresa precisa estar cadastrada (botão Empresas nas telas, ou importe a planilha).</span>
          <button type="button" className="btn-fantasma btn-sm" onClick={() => setLinhas([])}>Descartar</button>
          <button type="button" className="btn-primario btn-sm" disabled={!marcados} onClick={salvar}>Salvar {marcados} documento(s)</button>
        </div>
      </>)}
    </section>
  );
}

function Planilha() {
  const [svc] = useDepCadastro();
  const { aviso } = useAvisos();
  const [plano, setPlano] = useState(null);
  const [status, setStatus] = useState("");
  const [arquivo, setArquivo] = useState("");
  const ano = new Date().getFullYear();
  const ler = async (file) => {
    setArquivo(file.name); setPlano(null); setStatus("Lendo a planilha…");
    try {
      const p = lerPlanilhaCadastro(await lerPlanilha(file), Core.toIsoDate, ano);
      if (!p.empresas.length) { setStatus("Não achei uma coluna Empresa (ou Cliente / Razão social) em nenhuma aba. Use o modelo."); return; }
      setPlano(p); setStatus("");
    } catch (e) { setStatus("Não consegui ler a planilha: " + (e.message || e)); }
  };
  const importar = () => {
    const r = svc.aplicarPlanilha(plano);
    // responsáveis de cada setor (e o histórico do contábil) vão para o Em Dia; só onde ainda não há
    let resp = 0;
    plano.empresas.forEach((p) => {
      const id = r.ids[p.chave];
      if (!id) return;
      if (p.histContabil && !emDia.historicoResponsavel("contabil", id).length) { emDia.importarHistorico("contabil", id, p.histContabil); resp++; }
      Object.keys(p.responsaveis || {}).forEach((s) => { if (emDia.setores().some((x) => x.id === s) && !emDia.responsavel(s, id)) { emDia.definirResponsavel(s, id, p.responsaveis[s], ""); resp++; } });
    });
    setPlano(null); setArquivo("");
    aviso("Importado: " + [r.novasEmp && r.novasEmp + " empresa(s) nova(s)", r.atualizadas && r.atualizadas + " completada(s)", (r.alvNovos || r.alvAtualizados) && (r.alvNovos + r.alvAtualizados) + " alvará(s)", r.novosDocs && r.novosDocs + " documento(s)", r.faturamentos && r.faturamentos + " valor(es) de faturamento", resp && resp + " responsável(is) no Em Dia"].filter(Boolean).join(", ") + (r.repetidos ? ". " + r.repetidos + " documento(s) já existiam." : "."));
  };
  const modelo = async () => {
    const XLSX = await carregarXlsx();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Cód.", "Empresa", "CNPJ", "Regime"], ["1", "Empresa Exemplo Ltda", "00.000.000/0001-00", "Simples Nacional"]]), "Empresas");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Empresa", "CNPJ", "Tipo", "Número", "Emissão", "Vencimento", "Responsável"],
      ["Empresa Exemplo Ltda", "00.000.000/0001-00", "CND Federal", "", "15/09/2026", "14/03/2027", ""], ["Empresa Exemplo Ltda", "", "Alvará de funcionamento", "", "", "31/12/2026", ""]]), "Certidões e alvarás");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Empresa"].concat(MESES), ["Empresa Exemplo Ltda", 10000, 12000]]), "Faturamento " + ano);
    XLSX.writeFile(wb, "modelo-departamento-cadastro.xlsx");
  };
  const nomes = { alvaras: "renovação de alvarás (municipal, sanitário, bombeiros)", documentos: "certidões e alvarás", faturamentos: "faturamento", empresas: "empresas", ignorada: "ignorada (sem coluna Empresa)" };
  return (
    <section className="cartao p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[240px]">
          <h2 className="text-[16px] font-semibold">Planilha (Excel)</h2>
          <p className="text-[13px] text-muted">A planilha de renovação de alvarás (colunas CNPJ, Municipal, Sanitário e Bombeiro, com a data ou a situação) entra do jeito que está. Também: empresas, certidões e alvarás (colunas Empresa, Tipo e Vencimento) e faturamento (Empresa e os meses Jan a Dez; o ano vem do nome da aba). Pode ter várias abas no mesmo arquivo. Também lê a aba Empresas exportada do sistema do Depto. Contábil (regime, sócios, responsáveis, entrada e saída); as colunas de senha são ignoradas.</p>
        </div>
        <button type="button" className="btn-fantasma" onClick={modelo}>Baixar modelo</button>
        <BotaoArquivo className="btn-primario" aceita=".xlsx,.xls,.xlsm,.csv" aoEscolher={ler}>Escolher planilha</BotaoArquivo>
      </div>
      {status && <Mensagem texto={status} tipo="aviso" />}
      {plano && (<>
        <p className="text-[13px] text-muted break-all">{arquivo}</p>
        <ul className="rounded-lg border border-line divide-y divide-line text-[13.5px]">
          {plano.abas.map((a) => <li key={a.nome} className="flex justify-between gap-3 px-3 py-2"><span>{a.nome} <span className="text-muted">· {nomes[a.tipo]}</span></span><span className="text-muted tabular-nums">{numero(a.linhas)} linha(s)</span></li>)}
        </ul>
        {(() => {
          const pv = svc.previaPlanilha(plano);
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[["Empresas novas", pv.novas, "text-brand"], ["Já cadastradas (serão completadas)", pv.existentes, "text-ink"], ["Alvarás", pv.alvaras, "text-ink"],
                ["Certidões e documentos", plano.documentos.length, "text-ink"]].map(([t, n, cor]) => (
                <div key={t} className="rounded-lg border border-line px-3 py-2"><div className="text-[12px] text-muted">{t}</div><div className={"text-[20px] font-semibold tabular-nums " + cor}>{numero(n)}</div></div>
              ))}
              <p className="col-span-2 md:col-span-4 text-[12.5px] text-muted">
                A empresa é reconhecida pelo <strong>CNPJ</strong> (filiais com o mesmo nome ficam separadas); sem CNPJ, pelo nome{pv.semCnpj ? " (" + numero(pv.semCnpj) + " sem CNPJ)" : ""}. Nada é apagado: o que já existe só é completado.
                {plano.faturamentos.length ? " " + numero(plano.faturamentos.length) + " valor(es) de faturamento." : ""}
              </p>
            </div>
          );
        })()}
        {plano.avisos.length > 0 && <ul className="text-[12.5px] text-warn space-y-0.5">{plano.avisos.slice(0, 8).map((a, i) => <li key={i}>{a}</li>)}{plano.avisos.length > 8 && <li>…e mais {plano.avisos.length - 8}.</li>}</ul>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-fantasma btn-sm" onClick={() => setPlano(null)}>Cancelar</button><button type="button" className="btn-primario btn-sm" onClick={importar}>Importar</button></div>
      </>)}
    </section>
  );
}

function Dados() {
  const [svc] = useDepCadastro();
  const { aviso, confirmar } = useAvisos();
  const temDemo = svc.temDemonstracao();
  const demo = () => { aviso(carregarDemo(svc) ? "Demonstração carregada: empresas, certidões, alvarás, faturamento e demonstrativos fictícios." : "Já há dados cadastrados: a demonstração só entra onde está vazio."); };
  const tirarDemo = () => { const d = svc.limpar(true); aviso("Demonstração removida. Os dados de verdade continuam.", { desfazer: d }); };
  const apagar = async () => {
    if (!(await confirmar({ titulo: "Apagar tudo do Departamento Cadastro?", perigo: true, botao: "Apagar tudo",
      texto: "Empresas, certidões, alvarás, faturamentos, demonstrativos e os PDFs anexados saem deste navegador.\n\nDá para desfazer nos próximos segundos (os PDFs, não). Se quiser guardar, baixe o backup na Integração contábil antes." }))) return;
    const d = svc.limpar(false);
    apagarTodos();
    aviso("Departamento Cadastro apagado.", { desfazer: d });
  };
  return (
    <section className="cartao p-4 sm:p-5 space-y-3">
      <h2 className="text-[16px] font-semibold">Demonstração e limpeza</h2>
      <p className="text-[13px] text-muted">Para apresentar: a demonstração preenche as quatro telas com empresas e documentos fictícios (só onde está vazio). Depois é só remover.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-contorno btn-sm" onClick={demo}>Carregar demonstração</button>
        {temDemo && <button type="button" className="btn-contorno btn-sm" onClick={tirarDemo}>Remover só a demonstração</button>}
        <button type="button" className="btn-perigo btn-sm" onClick={apagar}>Apagar tudo do Departamento Cadastro</button>
      </div>
    </section>
  );
}

export default function Importar() {
  return (
    <div className="space-y-4 max-w-[1200px]">
      <Pdfs />
      <Planilha />
      <Dados />
      <p className="text-[12.5px] text-muted">Os PDFs ficam guardados neste navegador, junto com o documento (botão PDF em <Link to="/departamento-cadastro/certidoes" className="underline">Certidões</Link> e Alvarás). Eles não vão no arquivo de backup.</p>
    </div>
  );
}
