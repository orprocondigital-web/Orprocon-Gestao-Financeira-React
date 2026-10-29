import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { REGIMES, TIPOS_LUCRO_REAL, ativaNoMes, planilhaEmpresas } from "../../lib/depCadastro.mjs";
import { carregarXlsx } from "../../lib/leitores.js";
import { useDepCadastro } from "../../lib/useDepCadastro.js";
import { useEmDia } from "../../lib/useEmDia.js";
import { useAvisos } from "../Avisos.jsx";
import Janela from "../Janela.jsx";
import Icone from "../Icone.jsx";
import { Campo, Selo, TextoRapido, numero } from "../contabil/ui.jsx";
import { carregarDemo } from "./Importar.jsx";

/*
 * Cadastro geral de empresas: o mesmo cadastro que Certidões, Faturamentos, Demonstrativos e o Em Dia
 * usam. CNPJ, código, regime, período de cliente e o responsável de cada setor (gravado no Em Dia).
 * Matriz e filial saem do CNPJ (0001 = matriz).
 */
const mesBR = (m) => (m ? m.slice(5) + "/" + m.slice(0, 4) : "");

export function FormEmpresa({ editando, aoFechar }) {
  const [svc] = useDepCadastro();
  const [emDia] = useEmDia();
  const { aviso } = useAvisos();
  const setores = emDia.setores();
  const resp = emDia.todosResponsaveis();
  const vazio = { nome: "", documento: "", codigo: "", regime: "", tipoLucroReal: "", inicio: "", saida: "", baixa: "", segmento: "", contato: "", telefone: "", email: "", obs: "", cidade: "", uf: "", envioTaxas: "", fantasia: "", ie: "", ieUf: "" };
  const [f, setF] = useState(() => Object.assign({}, vazio, editando || {}));
  const [socios, setSocios] = useState(() => (editando && !editando.sociosDaMatriz && editando.socios ? editando.socios.map((x) => Object.assign({}, x)) : []));
  const [r, setR] = useState(() => {
    const o = {};
    setores.forEach((s) => { o[s.id] = editando ? ((resp[s.id] || {})[editando.id] || "") : ""; });
    return o;
  });
  const [desde, setDesde] = useState(emDia.mesPadrao());
  const [erro, setErro] = useState("");
  const muda = (c) => (e) => setF((x) => Object.assign({}, x, { [c]: e.target.value }));
  const mudaSocio = (i, c, v) => setSocios((l) => l.map((x, k) => (k === i ? Object.assign({}, x, { [c]: v }) : x)));
  const soma = socios.reduce((t, x) => t + (parseFloat(String(x.percentual || 0).replace(",", ".")) || 0), 0);
  const trocou = setores.some((s) => editando && (resp[s.id] || {})[editando.id] && (r[s.id] || "") !== ((resp[s.id] || {})[editando.id] || ""));
  const salvar = (ev) => {
    ev.preventDefault();
    try {
      const dados = Object.assign({}, f);
      if (!(editando && editando.sociosDaMatriz)) dados.socios = socios;
      const e = svc.salvarEmpresa(dados, editando && editando.id);
      setores.forEach((s) => { if ((r[s.id] || "") !== ((resp[s.id] || {})[e.id] || "")) emDia.definirResponsavel(s.id, e.id, r[s.id], desde); });
      aviso(editando ? "Empresa atualizada." : "Empresa cadastrada.");
      aoFechar();
    } catch (e) { setErro(e.message); }
  };
  const sub = "text-[12.5px] font-semibold uppercase tracking-wide text-muted sm:col-span-6 pt-1 border-t border-line mt-1";
  return (
    <Janela aberta titulo={editando ? "Editar empresa" : "Nova empresa"} aoFechar={aoFechar} largura="max-w-[720px]"
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button><button type="submit" form="form-emp" className="btn-primario">Salvar</button></>}>
      <form id="form-emp" onSubmit={salvar} className="grid sm:grid-cols-6 gap-3">
        <Campo rotulo="Razão social" id="emp-nome" className="sm:col-span-4"><input id="emp-nome" value={f.nome} onChange={muda("nome")} data-foco autoComplete="off" /></Campo>
        <Campo rotulo="Código" id="emp-cod" className="sm:col-span-2"><input id="emp-cod" value={f.codigo} onChange={muda("codigo")} autoComplete="off" /></Campo>
        <Campo rotulo="Nome fantasia" id="emp-fan" className="sm:col-span-6"><input id="emp-fan" value={f.fantasia} onChange={muda("fantasia")} autoComplete="off" /></Campo>
        <Campo rotulo="CNPJ/CPF" id="emp-doc" className="sm:col-span-3" dica="0001 no CNPJ = matriz; os outros números são filiais.">
          <input id="emp-doc" value={f.documento} onChange={muda("documento")} autoComplete="off" inputMode="numeric" /></Campo>
        <Campo rotulo="Segmento" id="emp-seg" className="sm:col-span-3"><input id="emp-seg" value={f.segmento} onChange={muda("segmento")} placeholder="Comércio, serviços, indústria…" autoComplete="off" /></Campo>
        <Campo rotulo="Inscrição estadual" id="emp-ie" className="sm:col-span-2"><input id="emp-ie" value={f.ie} onChange={muda("ie")} autoComplete="off" /></Campo>
        <Campo rotulo="UF da IE" id="emp-ieuf" className="sm:col-span-1"><input id="emp-ieuf" value={f.ieUf} onChange={muda("ieUf")} maxLength={2} autoComplete="off" /></Campo>
        <Campo rotulo="Regime" id="emp-reg" className="sm:col-span-3">
          <select id="emp-reg" value={f.regime} onChange={muda("regime")}><option value="">—</option>{REGIMES.map((x) => <option key={x} value={x}>{x}</option>)}</select></Campo>
        {f.regime === "Lucro Real" && <Campo rotulo="Apuração do Lucro Real" id="emp-lr" className="sm:col-span-3">
          <select id="emp-lr" value={f.tipoLucroReal} onChange={muda("tipoLucroReal")}><option value="">—</option>{TIPOS_LUCRO_REAL.map((x) => <option key={x} value={x}>{x}</option>)}</select></Campo>}

        <p className={sub}>Período</p>
        <Campo rotulo="Cliente desde" id="emp-ini" className="sm:col-span-2" dica="Vazio = sempre."><input id="emp-ini" type="month" value={f.inicio} onChange={muda("inicio")} /></Campo>
        <Campo rotulo="Saiu em" id="emp-sai" className="sm:col-span-2" dica="Último mês como cliente."><input id="emp-sai" type="month" value={f.saida} onChange={muda("saida")} /></Campo>
        <Campo rotulo="Data de baixa" id="emp-baixa" className="sm:col-span-2" dica="Empresa encerrada."><input id="emp-baixa" type="date" value={f.baixa} onChange={muda("baixa")} /></Campo>

        <p className={sub}>Contato</p>
        <Campo rotulo="Nome" id="emp-cont" className="sm:col-span-2"><input id="emp-cont" value={f.contato} onChange={muda("contato")} autoComplete="off" /></Campo>
        <Campo rotulo="Telefone" id="emp-tel" className="sm:col-span-2"><input id="emp-tel" value={f.telefone} onChange={muda("telefone")} inputMode="tel" autoComplete="off" /></Campo>
        <Campo rotulo="E-mail" id="emp-mail" className="sm:col-span-2"><input id="emp-mail" type="email" value={f.email} onChange={muda("email")} autoComplete="off" /></Campo>
        <Campo rotulo="Cidade" id="emp-cid" className="sm:col-span-2"><input id="emp-cid" value={f.cidade} onChange={muda("cidade")} autoComplete="off" /></Campo>
        <Campo rotulo="UF" id="emp-uf" className="sm:col-span-1"><input id="emp-uf" value={f.uf} onChange={muda("uf")} maxLength={2} autoComplete="off" /></Campo>
        <Campo rotulo="Envio das taxas (alvarás)" id="emp-tx" className="sm:col-span-3" dica="Ex.: OK Acessórias, OK WhatsApp 06/01/2026."><input id="emp-tx" value={f.envioTaxas} onChange={muda("envioTaxas")} autoComplete="off" /></Campo>
        <Campo rotulo="Observações" id="emp-obs" className="sm:col-span-6"><input id="emp-obs" value={f.obs} onChange={muda("obs")} autoComplete="off" /></Campo>

        <p className={sub}>Sócios</p>
        {editando && editando.sociosDaMatriz ? (
          <p className="sm:col-span-6 text-[13px] text-muted">Filial: os sócios são os da matriz{editando.socios.length ? " (" + editando.socios.map((x) => x.nome).join(", ") + ")" : ""}. Para mudar, edite a matriz.</p>
        ) : (
          <div className="sm:col-span-6 space-y-1.5">
            {socios.map((x, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_110px_70px_auto] sm:grid-cols-[minmax(0,1fr)_118px_64px_128px_128px_auto] gap-1.5 items-center">
                <input value={x.nome} onChange={(e) => mudaSocio(i, "nome", e.target.value)} placeholder="Nome" aria-label={"Sócio " + (i + 1)} className="h-9" />
                <input value={x.cpf} onChange={(e) => mudaSocio(i, "cpf", e.target.value)} placeholder="CPF" aria-label={"CPF do sócio " + (i + 1)} className="h-9" inputMode="numeric" />
                <input value={x.percentual} onChange={(e) => mudaSocio(i, "percentual", e.target.value)} placeholder="%" aria-label={"Participação do sócio " + (i + 1)} className="h-9 text-right" inputMode="decimal" />
                <input type="date" value={x.entrada || ""} onChange={(e) => mudaSocio(i, "entrada", e.target.value)} aria-label={"Entrada do sócio " + (i + 1)} title="Entrada" className="h-9 hidden sm:block" />
                <input type="date" value={x.saida || ""} onChange={(e) => mudaSocio(i, "saida", e.target.value)} aria-label={"Saída do sócio " + (i + 1)} title="Saída" className="h-9 hidden sm:block" />
                <button type="button" className="btn-perigo h-9 w-9 p-0" onClick={() => setSocios((l) => l.filter((_, k) => k !== i))} aria-label={"Tirar o sócio " + (i + 1)}><Icone nome="fechar" /></button>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <button type="button" className="btn-contorno btn-sm" onClick={() => setSocios((l) => l.concat({ nome: "", cpf: "", percentual: "", entrada: "", saida: "" }))}><Icone nome="mais" />Sócio</button>
              {socios.length > 0 && <span className={"text-[12.5px] tabular-nums " + (soma > 100.01 ? "text-debit font-semibold" : "text-muted")}>Total: {soma.toLocaleString("pt-BR")}%{socios.length && soma < 99.99 ? " (falta " + (100 - soma).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%)" : ""}</span>}
              {socios.length > 0 && <span className="text-[12px] text-muted hidden sm:inline ml-auto">entrada · saída</span>}
            </div>
          </div>
        )}

        <fieldset className="sm:col-span-6 space-y-2 pt-1 border-t border-line mt-1">
          <legend className="sr-only">Responsável em cada setor</legend>
          <p className="text-[12.5px] font-semibold uppercase tracking-wide text-muted pt-2">Responsável em cada setor</p>
          <div className="grid sm:grid-cols-3 gap-2">
            {setores.map((s) => {
              const hist = editando ? emDia.historicoResponsavel(s.id, editando.id) : [];
              return (
                <Campo key={s.id} rotulo={s.nome} id={"emp-r-" + s.id} dica={hist.length > 1 ? "Antes: " + hist.slice(0, -1).map((h) => h.nome || "ninguém").join(", ") : ""}>
                  <input id={"emp-r-" + s.id} list="emp-pessoas" value={r[s.id] || ""} onChange={(e) => setR((x) => Object.assign({}, x, { [s.id]: e.target.value }))} autoComplete="off" />
                </Campo>
              );
            })}
          </div>
          {trocou && (
            <label className="flex flex-wrap items-center gap-2 text-[13px] rounded-lg bg-info-soft text-info px-3 py-2">
              A troca de responsável vale a partir de
              <input type="month" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-8 w-[160px] text-[13px]" aria-label="Troca vale a partir de" />
              <span className="text-[12.5px]">Os meses anteriores continuam com quem era o responsável.</span>
            </label>
          )}
          <datalist id="emp-pessoas">{emDia.pessoas().map((p) => <option key={p} value={p} />)}</datalist>
        </fieldset>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
      {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
    </Janela>
  );
}

export default function Empresas() {
  const [svc, versao] = useDepCadastro();
  const [emDia, versaoEmDia] = useEmDia();
  const { aviso, confirmar } = useAvisos();
  const [busca, setBusca] = useState("");
  const [regime, setRegime] = useState("");
  const [matrizes, setMatrizes] = useState(false);
  const [saidas, setSaidas] = useState(false);
  const [form, setForm] = useState(null);   // { editando }
  const lista = useMemo(() => svc.empresas(), [svc, versao]);   // eslint-disable-line
  const qtdDocs = useMemo(() => svc.qtdDocumentos(), [svc, versao]);   // eslint-disable-line
  const resp = useMemo(() => emDia.todosResponsaveis(), [emDia, versaoEmDia]);   // eslint-disable-line
  const setores = useMemo(() => emDia.setores(), [emDia, versaoEmDia]);   // eslint-disable-line
  const pessoas = emDia.pessoas();
  const mesAtual = svc.hoje().slice(0, 7);
  const nomes = {};
  lista.forEach((c) => { nomes[c.id] = c.nome; });
  const ativas = lista.filter((c) => ativaNoMes(c, mesAtual) || (c.inicio && c.inicio > mesAtual));
  const visiveis = lista.filter((c) => {
    if (!saidas && ((c.saida && c.saida < mesAtual) || (c.baixa && c.baixa.slice(0, 7) < mesAtual))) return false;
    if (regime && (c.regime || "(sem)") !== regime) return false;
    if (matrizes && c.filial) return false;
    const b = busca.trim().toLowerCase(), dig = busca.replace(/\D/g, "");
    return !b || String(c.nome).toLowerCase().indexOf(b) > -1 || String(c.codigo || "").toLowerCase() === b || (dig.length >= 3 && String(c.documento || "").replace(/\D/g, "").indexOf(dig) > -1);
  });
  const saiu = lista.length - ativas.length;
  const semRegime = ativas.filter((c) => !c.regime).length;
  const filiais = ativas.filter((c) => c.filial).length;
  const excluir = async (c) => {
    if (qtdDocs[c.id]) { aviso(c.nome + " tem " + qtdDocs[c.id] + " documento(s). Exclua os documentos antes, ou marque o mês em que ela saiu."); return; }
    if (!(await confirmar({ titulo: "Excluir " + c.nome + "?", perigo: true, botao: "Excluir", texto: "Os faturamentos e demonstrativos dela também saem. Se ela só deixou de ser cliente, prefira marcar o mês em que saiu: o histórico fica." }))) return;
    try { svc.excluirEmpresa(c.id); aviso("Empresa excluída."); } catch (e) { aviso(e.message); }
  };
  /** Exporta o que está na lista (com os filtros) no formato do Acessórias + colunas da Central: dá para editar e importar de volta. */
  const exportar = async () => {
    try {
      const XLSX = await carregarXlsx();
      const ws = XLSX.utils.aoa_to_sheet(planilhaEmpresas(visiveis));
      ws["!cols"] = [8, 20, 34, 22, 14, 20, 26, 15, 14, 6].map((w) => ({ wch: w })).concat(Array(11).fill({ wch: 6 }), [18, 16, 16, 5, 10, 10, 30].map((w) => ({ wch: w })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Empresas");
      XLSX.writeFile(wb, "empresas-" + svc.hoje() + ".xlsx");
      aviso(numero(visiveis.length) + " empresa(s) exportada(s). Dá para editar e importar de volta em Importar: nada duplica.");
    } catch (e) { aviso("Não consegui gerar o Excel: " + (e.message || e)); }
  };
  const mudarRegime = (c, v) => { try { svc.salvarEmpresa(Object.assign({}, c, { regime: v }), c.id); } catch (e) { aviso(e.message); } };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
        <span><strong className="text-[16px]">{numero(ativas.length)}</strong> empresa(s) cliente(s)</span>
        {filiais > 0 && <span className="text-muted">{filiais} filial(is)</span>}
        {semRegime > 0 && <button type="button" className="text-warn font-semibold hover:underline" onClick={() => setRegime("(sem)")}>{semRegime} sem regime</button>}
        {saiu > 0 && <span className="text-muted">{saiu} já saíram</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, código ou CNPJ…" aria-label="Buscar empresa" className="max-w-[260px] h-9" />
        <select value={regime} onChange={(e) => setRegime(e.target.value)} aria-label="Regime" className="h-9 w-auto">
          <option value="">Todos os regimes</option>{REGIMES.map((x) => <option key={x} value={x}>{x}</option>)}<option value="(sem)">Sem regime</option>
        </select>
        <label className="inline-flex items-center gap-2 text-[13.5px]"><input type="checkbox" checked={matrizes} onChange={(e) => setMatrizes(e.target.checked)} /> Só matrizes</label>
        {saiu > 0 && <label className="inline-flex items-center gap-2 text-[13.5px]"><input type="checkbox" checked={saidas} onChange={(e) => setSaidas(e.target.checked)} /> Mostrar quem saiu</label>}
        <div className="flex-1" />
        <Link to="/departamento-cadastro/importar" className="btn-contorno btn-sm">Importar</Link>
        <button type="button" className="btn-contorno btn-sm" onClick={exportar} disabled={!visiveis.length}>Exportar Excel</button>
        <button type="button" className="btn-primario btn-sm" onClick={() => setForm({ editando: null })}><Icone nome="mais" />Nova empresa</button>
      </div>
      <div className="cartao overflow-hidden">
        {!lista.length ? (
          <div className="p-10 text-center space-y-3">
            <strong className="block text-[15px]">Nenhuma empresa cadastrada</strong>
            <span className="block text-muted text-[13.5px]">Este é o cadastro que o sistema inteiro usa. Cadastre em Nova empresa, importe uma planilha (Empresa, CNPJ, Código, Regime) ou veja como fica com a demonstração.</span>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <button type="button" className="btn-contorno btn-sm" onClick={() => aviso(carregarDemo(svc) ? "Demonstração carregada." : "Já há dados: a demonstração só entra onde está vazio.")}>Carregar demonstração</button>
              <Link to="/departamento-cadastro/importar" className="btn-contorno btn-sm">Importar planilha</Link>
            </div>
          </div>
        ) : !visiveis.length ? (
          <div className="p-10 text-center"><strong className="block text-[15px]">Nenhuma empresa com esse filtro</strong></div>
        ) : (
          <div className="overflow-x-auto relative">
            <table className="w-full text-[13.5px]">
              <thead className="bg-surface-2 text-left text-[12px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-semibold w-[60px]">Cód.</th>
                  <th className="px-3 py-2.5 font-semibold min-w-[230px]">Empresa</th>
                  <th className="px-2 py-2.5 font-semibold">Regime</th>
                  {setores.map((s) => <th key={s.id} className="px-2 py-2.5 font-semibold min-w-[112px]">{s.nome}</th>)}
                  <th className="px-2 py-2.5 font-semibold whitespace-nowrap">Cliente</th>
                  <th className="px-2 py-2.5 font-semibold text-right">Docs</th>
                  <th className="px-2 py-2.5"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visiveis.map((c) => {
                  const saiuJa = (c.saida && c.saida < mesAtual) || (c.baixa && c.baixa.slice(0, 7) < mesAtual);
                  return (
                    <tr key={c.id} className={"hover:bg-surface-2 " + (saiuJa ? "opacity-60" : "")}>
                      <td className="px-3 py-1.5 tabular-nums text-muted">{c.codigo}</td>
                      <td className="px-3 py-1.5">
                        <Link to={"/departamento-cadastro/buscar?empresa=" + c.id} className="block font-medium hover:text-brand hover:underline">{c.nome}</Link>
                        <span className="text-[12px] text-muted tabular-nums">{c.documento || "sem CNPJ/CPF"}</span>
                        {c.baixa && <span className="ml-1.5 align-middle"><Selo tipo="erro">Baixada em {c.baixa.split("-").reverse().join("/")}</Selo></span>}
                        {c.filial && <span className="ml-1.5 align-middle"><Selo tipo="neutro" title="Pelo CNPJ (não é 0001)">{c.matrizId ? "Filial de " + nomes[c.matrizId] : "Filial"}</Selo></span>}
                      </td>
                      <td className="px-1 py-1">
                        <select value={c.regime || ""} onChange={(e) => mudarRegime(c, e.target.value)} aria-label={"Regime de " + c.nome}
                          className={"h-8 w-[142px] px-2 text-[13px] " + (c.regime ? "border-transparent bg-transparent hover:border-line" : "border-warn/40 bg-warn-soft text-warn")}>
                          <option value="">Escolher…</option>{REGIMES.map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                        {c.regime === "Lucro Real" && <span className={"block px-2 text-[11.5px] " + (c.tipoLucroReal ? "text-muted" : "text-warn")}>{c.tipoLucroReal ? "LR " + c.tipoLucroReal.toLowerCase() : "falta: trimestral ou anual"}</span>}
                      </td>
                      {setores.map((s) => (
                        <td key={s.id} className="px-1 py-1"><TextoRapido valor={(resp[s.id] || {})[c.id] || ""} lista="emp-pessoas-tab" rotulo={"Responsável em " + s.nome + " de " + c.nome} placeholder="—" className="w-[108px]"
                          aoGravar={(v) => emDia.definirResponsavel(s.id, c.id, v)} /></td>
                      ))}
                      <td className="px-2 py-1.5 whitespace-nowrap text-[12.5px] text-muted tabular-nums">{c.inicio || c.saida ? (c.inicio ? "desde " + mesBR(c.inicio) : "") + (c.saida ? (c.inicio ? " · " : "") + "saiu " + mesBR(c.saida) : "") : "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{qtdDocs[c.id] ? <Link to="/departamento-cadastro/certidoes" className="text-brand hover:underline">{qtdDocs[c.id]}</Link> : <span className="text-muted">0</span>}</td>
                      <td className="px-2 py-1 whitespace-nowrap text-right">
                        <button type="button" className="btn-fantasma btn-sm" onClick={() => setForm({ editando: c })}>Editar</button>
                        <button type="button" className="btn-perigo btn-sm" onClick={() => excluir(c)}>Excluir</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <datalist id="emp-pessoas-tab">{pessoas.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
        )}
      </div>
      <p className="text-[12.5px] text-muted">Os responsáveis são os mesmos da grade do Em Dia: mudar aqui muda lá. Empresa com documentos não pode ser excluída; quando deixar de ser cliente, marque o mês em que saiu (Editar).</p>
      {form && <FormEmpresa editando={form.editando} aoFechar={() => setForm(null)} />}
    </div>
  );
}
