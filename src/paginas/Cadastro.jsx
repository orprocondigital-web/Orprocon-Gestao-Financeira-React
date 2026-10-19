import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useContabil } from "../lib/useContabil.js";
import { lerPlanilha } from "../lib/leitores.js";
import { useAvisos } from "../componentes/Avisos.jsx";
import Janela from "../componentes/Janela.jsx";
import Icone from "../componentes/Icone.jsx";
import { BotaoArquivo, Campo, Mensagem, numero } from "../componentes/contabil/ui.jsx";

/*
 * Cadastros da Integração contábil (clientes, fornecedores, plano de contas, centro de custos e as tabelas
 * de bancos e unidades). Valem para todos os meses. Dá para importar a aba da planilha ou cadastrar à mão.
 */
const POR_PAGINA = 500;
const COLUNAS_NA_TABELA = 4;

function FormItem({ id, editando, aoFechar }) {
  const [svc] = useContabil();
  const { aviso } = useAvisos();
  const cols = useMemo(() => svc.colunasDoCadastro(id), [svc, id]);
  const [valores, setValores] = useState([]);
  const [erro, setErro] = useState("");
  useEffect(() => {
    setValores(cols.map((c, i) => {
      const v = editando ? (editando.linha ? editando.linha[i] : (i === 0 ? editando.nome : "")) : "";
      return v === undefined || v === null ? "" : String(v);
    }));
    setErro("");
  }, [cols, editando]);
  const salvar = (ev) => {
    ev.preventDefault();
    try {
      svc.salvarItemCadastro(id, valores, editando && editando.id);
      aviso(editando ? "Item atualizado." : "Item adicionado.");
      if (editando) aoFechar(); else { setValores(cols.map(() => "")); setErro(""); }
    } catch (e) { setErro(e.message); }
  };
  return (
    <Janela aberta titulo={(editando ? "Editar: " : "Novo item: ") + svc.item(id).label} aoFechar={aoFechar} largura={cols.length > 4 ? "max-w-[680px]" : "max-w-[460px]"}
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>{editando ? "Cancelar" : "Fechar"}</button>
        <button type="submit" form="form-cadastro" className="btn-primario">{editando ? "Salvar" : "Adicionar"}</button></>}>
      <form id="form-cadastro" onSubmit={salvar} className={"grid gap-3 " + (cols.length > 4 ? "sm:grid-cols-2" : "")}>
        {cols.map((c, i) => (
          <Campo key={i} rotulo={c || "Coluna " + (i + 1)} id={"cad-" + i}>
            <input id={"cad-" + i} value={valores[i] || ""} autoComplete="off" data-foco={i === 0 ? true : undefined}
              onChange={(e) => setValores((v) => { const n = v.slice(); n[i] = e.target.value; return n; })} />
          </Campo>
        ))}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
      {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
      {!editando && <p className="text-[12.5px] text-muted">Depois de adicionar, a janela fica aberta para o próximo item.</p>}
    </Janela>
  );
}

export default function Cadastro() {
  const { id } = useParams();
  const [svc, versao] = useContabil();
  const { aviso, confirmar } = useAvisos();
  const cad = svc.item(id);
  const lista = useMemo(() => svc.cadastro(id), [svc, id, versao]);   // eslint-disable-line
  const cab = useMemo(() => svc.colunasDoCadastro(id), [svc, id, versao]);   // eslint-disable-line
  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(POR_PAGINA);
  const [form, setForm] = useState({ aberta: false, editando: null });
  const [msg, setMsg] = useState({ texto: "", tipo: "info" });
  const [lendo, setLendo] = useState(false);
  useEffect(() => { setBusca(""); setLimite(POR_PAGINA); setMsg({ texto: "" }); }, [id]);

  const visiveis = useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return lista;
    return lista.filter((e) => (e.linha || [e.nome]).some((x) => String(x === null || x === undefined ? "" : x).toLowerCase().indexOf(b) > -1));
  }, [lista, busca]);

  if (!cad || cad.tipo !== "cadastro") return <div className="cartao p-8 text-center"><p className="text-muted">Cadastro não encontrado.</p><Link to="/integracao" className="btn-contorno mt-4">Voltar</Link></div>;
  const nCols = Math.min(Math.max(cab.length, 1), COLUNAS_NA_TABELA);

  const importar = async (file) => {
    setLendo(true); setMsg({ texto: "Lendo " + file.name + "…", tipo: "info" });
    try {
      const lido = svc.lerAba(id, await lerPlanilha(file));
      if (lido.erro) { setMsg({ texto: lido.erro, tipo: "aviso" }); return; }
      let somar = true;
      if (lido.jaTem) {
        const r = await confirmar({ titulo: "Somar ou substituir?", botao: "Somar", alternativa: "Substituir",
          texto: "Encontrei " + numero(lido.itens.length) + " item(ns) na aba \"" + lido.aba + "\". Já existem " + numero(lido.jaTem) + " neste cadastro.\n\nSomar: mantém os atuais e acrescenta os novos (nomes repetidos ficam uma vez só).\nSubstituir: fica só o que está na planilha." });
        if (!r) { setMsg({ texto: "Nada foi importado.", tipo: "info" }); return; }
        somar = r === true;
      }
      setMsg({ texto: svc.gravarAba(id, lido, somar), tipo: "info" });
    } catch (e) { setMsg({ texto: "Não consegui ler a planilha: " + (e.message || e), tipo: "erro" }); }
    finally { setLendo(false); }
  };
  const excluir = (e) => { const d = svc.excluirItemCadastro(id, e.id); if (d) aviso("Item excluído.", { desfazer: d }); };
  const apagarTudo = async () => {
    if (!(await confirmar({ titulo: "Apagar o cadastro inteiro?", perigo: true, botao: "Apagar " + numero(lista.length) + " itens",
      texto: "Todos os itens de " + cad.label + " serão apagados deste navegador. Dá para importar a aba da planilha de novo depois." }))) return;
    svc.apagarCadastro(id); aviso("Cadastro apagado.");
  };

  return (
    <div className="space-y-4 max-w-[1200px]">
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={busca} onChange={(e) => { setBusca(e.target.value); setLimite(POR_PAGINA); }} placeholder={"Buscar em " + cad.label.toLowerCase() + "…"} aria-label="Buscar no cadastro" className="max-w-[340px] h-9" />
        <span className="text-[13px] text-muted">{numero(lista.length)} {lista.length === 1 ? "item" : "itens"}</span>
        <div className="flex-1" />
        <button type="button" className="btn-primario btn-sm" onClick={() => setForm({ aberta: true, editando: null })}><Icone nome="mais" />Novo item</button>
        <BotaoArquivo className="btn-contorno btn-sm" aceita=".xlsx,.xlsm,.xls" aoEscolher={importar} disabled={lendo}>Importar aba da planilha</BotaoArquivo>
      </div>
      <Mensagem texto={msg.texto} tipo={msg.tipo} aoFechar={() => setMsg({ texto: "" })} />

      <div className="cartao overflow-hidden">
        {lista.length === 0 ? (
          <div className="p-10 text-center">
            <strong className="block text-[15px]">Nenhum item cadastrado</strong>
            <span className="text-muted text-[13.5px]">Cadastre em Novo item ou importe a aba "{cad.sheetName}" da planilha.</span>
          </div>
        ) : visiveis.length === 0 ? <p className="p-8 text-center text-muted">Nada encontrado com "{busca}".</p> : (
          <div className="overflow-x-auto relative">
            <table className="w-full text-[13.5px]">
              <thead className="bg-surface-2 text-left text-[12px] uppercase tracking-wide text-muted">
                <tr>{cab.slice(0, nCols).map((h, i) => <th key={i} className="px-3 py-2.5 font-semibold">{h || "Coluna " + (i + 1)}</th>)}<th className="px-3 py-2.5"><span className="sr-only">Ações</span></th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visiveis.slice(0, limite).map((e) => {
                  const cel = e.linha ? e.linha.slice(0, nCols) : [e.nome];
                  while (cel.length < nCols) cel.push("");
                  return (
                    <tr key={e.id} className="hover:bg-surface-2">
                      {cel.map((c, i) => <td key={i} className={"px-3 py-2 " + (i === 0 ? "font-medium" : "")}>{c === null || c === undefined ? "" : String(c)}</td>)}
                      <td className="px-2 py-1.5 whitespace-nowrap text-right">
                        <button type="button" className="btn-fantasma btn-sm" onClick={() => setForm({ aberta: true, editando: e })}>Editar</button>
                        <button type="button" className="btn-perigo btn-sm" onClick={() => excluir(e)}>Excluir</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {visiveis.length > limite && (
          <div className="border-t border-line p-3 text-center text-[13px] text-muted">
            Mostrando {numero(limite)} de {numero(visiveis.length)}. Use a busca, ou{" "}
            <button type="button" className="btn-contorno btn-sm ml-1" onClick={() => setLimite((l) => l + POR_PAGINA)}>mostre mais</button>
          </div>
        )}
      </div>
      {cab.length > COLUNAS_NA_TABELA && <p className="text-[12.5px] text-muted">A tabela mostra as {COLUNAS_NA_TABELA} primeiras colunas; em Editar aparecem todas ({Math.min(cab.length, 12)}).</p>}
      {lista.length > 0 && <div className="pt-2"><button type="button" className="btn-perigo btn-sm" onClick={apagarTudo}>Apagar o cadastro inteiro</button></div>}

      {form.aberta && <FormItem id={id} editando={form.editando} aoFechar={() => setForm({ aberta: false, editando: null })} />}
    </div>
  );
}
