import { useState } from "react";
import { Core, Inicio } from "../../lib/legado.js";
import { useAuth } from "../../lib/auth.jsx";
import { DEMO_LIBERADA } from "../../lib/sincronizacao.js";
import { lerPlanilhaCadastro, planilhaEmpresas, MESES } from "../../lib/depCadastro.mjs";
import { useDepCadastro } from "../../lib/useDepCadastro.js";
import { emDia } from "../../lib/useEmDia.js";
import { carregarXlsx, lerPlanilha } from "../../lib/leitores.js";
import { apagarTodos } from "../../lib/arquivos.js";
import { useAvisos } from "../Avisos.jsx";
import { SecaoPdfs } from "./LerPdfs.jsx";
import { BotaoArquivo, Mensagem, numero } from "../contabil/ui.jsx";

/*
 * Departamento Cadastro › Importar e demonstração: PDFs de certidões e alvarás (lê tipo, CNPJ, emissão,
 * validade e número para conferir antes de salvar), planilha do Excel e os dados de demonstração.
 */

export { DEMO_LIBERADA };

/** Carrega a demonstração (empresas, certidões, alvarás, faturamento e demonstrativos fictícios). */
export function carregarDemo(svc) {
  if (!DEMO_LIBERADA) return false;
  return svc.carregarDemonstracao(Inicio.vencimentosExemplo(svc.hoje()));
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
    // aba Empresas no formato do Acessórias (o mesmo da exportação em Empresas), com uma linha de exemplo
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(planilhaEmpresas([{ codigo: "1", documento: "00.000.000/0001-00", nome: "Empresa Exemplo Ltda", fantasia: "Exemplo",
      contato: "Fulano Exemplo", email: "contato@exemplo.invalid", telefone: "48999990000", ie: "123456789", ieUf: "SC", departamentos: ["Contábil", "Fiscal", "Pessoal"],
      regime: "Simples Nacional", cidade: "Tubarão", uf: "SC", inicio: "2026-01" }])), "Empresas");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Empresa", "CNPJ", "Tipo", "Número", "Emissão", "Vencimento", "Responsável"],
      ["Empresa Exemplo Ltda", "00.000.000/0001-00", "CND Federal", "", "15/09/2026", "14/03/2027", ""], ["Empresa Exemplo Ltda", "", "Alvará de funcionamento", "", "", "31/12/2026", ""]]), "Certidões e alvarás");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Empresa"].concat(MESES), ["Empresa Exemplo Ltda", 10000, 12000]]), "Faturamento " + ano);
    XLSX.writeFile(wb, "modelo-departamento-cadastro.xlsx");
  };
  const nomes = { acessorias: "empresas do Acessórias (contatos, IE e departamentos)", contatos: "contatos das empresas (Acessórias)", alvaras: "renovação de alvarás (municipal, sanitário, bombeiros)", documentos: "certidões e alvarás", faturamentos: "faturamento", empresas: "empresas", ignorada: "ignorada (sem coluna Empresa)" };
  return (
    <section className="cartao p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[240px]">
          <h2 className="text-[16px] font-semibold">Planilha (Excel ou CSV)</h2>
          <p className="text-[13px] text-muted"><strong className="text-ink-2">Empresas do Acessórias:</strong> o CSV do cadastro de empresas (separado por ponto e vírgula) entra como está: razão, fantasia, CNPJ, contato, IE e os departamentos marcados com S. O CNPJ é a chave: o que veio preenchido atualiza a empresa, campo vazio não apaga nada e linhas repetidas (mais de um contato ou IE) viram uma empresa só. <strong className="text-ink-2">Contatos do Acessórias:</strong> a lista de e-mails e contatos (CNPJ, Razão Social, Nome, E-mail, Telefone) soma os contatos em cada empresa, sem apagar os que já existem; a própria Orprocon e a equipe (@orprocon.com.br) ficam de fora.</p>
          <p className="text-[13px] text-muted">A planilha de renovação de alvarás (colunas CNPJ, Municipal, Sanitário e Bombeiro, com a data ou a situação) entra do jeito que está. Também: empresas, certidões e alvarás (colunas Empresa, Tipo e Vencimento) e faturamento (Empresa e os meses Jan a Dez; o ano vem do nome da aba). Pode ter várias abas no mesmo arquivo. Também lê a aba Empresas exportada do sistema do Depto. Contábil (regime, sócios, responsáveis, entrada e saída); as colunas de senha são ignoradas.</p>
        </div>
        <button type="button" className="btn-fantasma" onClick={modelo} title="Abas: Empresas (formato do Acessórias), Certidões e alvarás, Faturamento">Baixar modelo</button>
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[["Empresas novas", pv.novas, "text-brand"], ["Já cadastradas (serão completadas)", pv.existentes, "text-ink"], ["Alvarás", pv.alvaras, "text-ink"],
                ["Certidões e documentos", plano.documentos.length, "text-ink"], ["Linhas com problema", pv.comProblema, pv.comProblema ? "text-warn" : "text-ink"]].map(([t, n, cor]) => (
                <div key={t} className="rounded-lg border border-line px-3 py-2"><div className="text-[12px] text-muted">{t}</div><div className={"text-[20px] font-semibold tabular-nums " + cor}>{numero(n)}</div></div>
              ))}
              <p className="col-span-2 md:col-span-5 text-[12.5px] text-muted">
                A empresa é reconhecida pelo <strong>CNPJ</strong> (filiais com o mesmo nome ficam separadas); sem CNPJ, pelo nome{pv.semCnpj ? " (" + numero(pv.semCnpj) + " sem CNPJ)" : ""}. Nada é apagado: o que já existe só é completado{plano.abas.some((a) => a.tipo === "acessorias") ? " (na planilha do Acessórias, o que veio preenchido atualiza)" : ""}.
                {plano.faturamentos.length ? " " + numero(plano.faturamentos.length) + " valor(es) de faturamento." : ""}
                {plano.abas.some((a) => a.tipo === "contatos") ? " Os contatos somam aos que a empresa já tem." : ""}
                {plano.foraDaImportacao ? " " + plano.foraDaImportacao : ""}
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
  const { usuario } = useAuth();
  const comServidor = !DEMO_LIBERADA;
  const { aviso, confirmar } = useAvisos();
  const temDemo = svc.temDemonstracao();
  const demo = () => { aviso(carregarDemo(svc) ? "Demonstração carregada: empresas, certidões, alvarás, faturamento e demonstrativos fictícios." : "Já há dados cadastrados: a demonstração só entra onde está vazio."); };
  const tirarDemo = () => { const d = svc.limpar(true); aviso("Demonstração removida. Os dados de verdade continuam.", { desfazer: d }); };
  const apagar = async () => {
    if (!(await confirmar({ titulo: "Apagar tudo do Departamento Cadastro?", perigo: true, botao: "Apagar tudo",
      texto: comServidor
        ? "Empresas, certidões, alvarás, faturamentos e demonstrativos saem do servidor, para TODOS os usuários.\n\nDá para desfazer nos próximos segundos."
        : "Empresas, certidões, alvarás, faturamentos, demonstrativos e os PDFs anexados saem deste navegador.\n\nDá para desfazer nos próximos segundos (os PDFs, não). Se quiser guardar, baixe o backup na Celesp · Integração contábil antes." }))) return;
    const d = svc.limpar(false);
    apagarTodos();
    aviso("Departamento Cadastro apagado.", { desfazer: d });
  };
  if (comServidor && !(usuario && usuario.perfil === "admin")) return null;   // com servidor, só o admin limpa (vale para todos)
  if (comServidor) {
    return (
      <section className="cartao p-4 sm:p-5 space-y-3">
        <h2 className="text-[16px] font-semibold">Limpeza</h2>
        <p className="text-[13px] text-muted">Os dados do Departamento Cadastro ficam no servidor e são os mesmos para todos os usuários. A demonstração fica desligada para não misturar dados fictícios com os de verdade.</p>
        <button type="button" className="btn-perigo btn-sm" onClick={apagar}>Apagar tudo do Departamento Cadastro (para todos)</button>
      </section>
    );
  }
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
      <SecaoPdfs />
      <Planilha />
      <Dados />
      <p className="text-[12.5px] text-muted">{DEMO_LIBERADA
        ? "Os PDFs ficam guardados neste navegador, junto com o documento (botão PDF em Certidões e Alvarás). Eles não vão no arquivo de backup."
        : "Os PDFs ficam guardados no servidor, junto com o documento: qualquer pessoa do Departamento Cadastro abre de qualquer computador (botão PDF em Certidões e Alvarás)."}</p>
    </div>
  );
}
