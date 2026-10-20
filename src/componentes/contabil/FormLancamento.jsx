import { useEffect, useMemo, useState } from "react";
import { Core } from "../../lib/legado.js";
import { contabil } from "../../lib/useContabil.js";
import { useAvisos } from "../Avisos.jsx";
import Janela from "../Janela.jsx";
import { Campo, Segmentado, formatarValor } from "./ui.jsx";

const VAZIO = { data: "", dataMov: "", desc: "", doc: "", modelo: "", valor: "", sign: "C", categoria: "", unidade: "", natureza: "", conta: "", nome: "", cpf: "" };

/** Novo lançamento ou edição, numa janela. editando: o lançamento (ou null para novo). */
export default function FormLancamento({ aberta, conta, editando, aoFechar }) {
  const { aviso } = useAvisos();
  const [f, setF] = useState(VAZIO);
  const [erro, setErro] = useState("");
  const opcoes = useMemo(() => (aberta ? contabil.opcoesFormulario() : null), [aberta]);

  useEffect(() => {
    if (!aberta) return;
    setErro("");
    setF(editando ? Object.assign({}, VAZIO, editando, { valor: formatarValor(editando.valorNum), sign: editando.sign === "D" ? "D" : "C" }) : VAZIO);
  }, [aberta, editando]);

  if (!aberta || !conta) return null;
  const muda = (campo) => (e) => setF((x) => Object.assign({}, x, { [campo]: e.target.value }));
  const comOpcao = (lista, valor) => (valor && lista.indexOf(valor) < 0 ? lista.concat(valor) : lista);   // valor vindo da planilha que não está na lista

  const salvar = (ev) => {
    if (ev) ev.preventDefault();
    const valorNum = Core.parseValor(f.valor);
    try {
      contabil.salvarLancamento(conta.id, Object.assign({}, f, { valorNum }), editando && editando.id);
      aviso(editando ? "Lançamento atualizado." : "Lançamento adicionado.");
      if (editando) aoFechar();
      else { setF(Object.assign({}, VAZIO, { data: f.data, dataMov: f.dataMov, categoria: f.categoria, unidade: f.unidade })); setErro(""); }
    } catch (e) { setErro(e.message); }
  };

  return (
    <Janela aberta titulo={editando ? "Editar lançamento" : "Novo lançamento"} aoFechar={aoFechar} largura="max-w-[760px]"
      rodape={<>
        <button type="button" className="btn-fantasma" onClick={aoFechar}>{editando ? "Cancelar" : "Fechar"}</button>
        <button type="submit" form="form-lancamento" className="btn-primario">{editando ? "Salvar" : "Adicionar"}</button>
      </>}>
      <form id="form-lancamento" onSubmit={salvar} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Campo rotulo="Data" id="fl-data"><input id="fl-data" type="date" value={f.data} onChange={muda("data")} required data-foco /></Campo>
        {conta.hasDataMov
          ? <Campo rotulo="Data mov." id="fl-datamov"><input id="fl-datamov" type="date" value={f.dataMov} onChange={muda("dataMov")} /></Campo>
          : <div className="hidden sm:block" />}
        <Campo rotulo="Valor" id="fl-valor" className="col-span-2">
          <div className="flex gap-2">
            <input id="fl-valor" inputMode="decimal" placeholder="0,00" value={f.valor} onChange={muda("valor")} className="text-right tabular-nums"
              onBlur={() => { const v = Core.parseValor(f.valor); if (!isNaN(v)) setF((x) => Object.assign({}, x, { valor: formatarValor(v) })); }} />
            <div className="shrink-0">
              <Segmentado rotulo="Crédito ou débito" valor={f.sign} aoMudar={(s) => setF((x) => Object.assign({}, x, { sign: s }))}
                opcoes={[["C", "Crédito", "text-credit"], ["D", "Débito", "text-debit"]]} pequeno />
            </div>
          </div>
        </Campo>
        <Campo rotulo="Descrição / histórico" id="fl-desc" className="col-span-2 sm:col-span-3"><input id="fl-desc" value={f.desc} onChange={muda("desc")} autoComplete="off" /></Campo>
        <Campo rotulo="Documento" id="fl-doc"><input id="fl-doc" value={f.doc} onChange={muda("doc")} autoComplete="off" /></Campo>

        <Campo rotulo="Categoria" id="fl-cat">
          <select id="fl-cat" value={f.categoria} onChange={muda("categoria")}>
            <option value="">Pendente (sem categoria)</option>
            {comOpcao(opcoes.categorias, f.categoria).map((c) => <option key={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Unidade" id="fl-uni">
          <select id="fl-uni" value={f.unidade} onChange={muda("unidade")}>
            <option value="">Sem unidade</option>
            {comOpcao(opcoes.unidades, f.unidade).map((c) => <option key={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Natureza" id="fl-nat">
          <input id="fl-nat" list="fl-naturezas" value={f.natureza} onChange={muda("natureza")} autoComplete="off"
            onBlur={() => { if (!f.conta) { const c = contabil.contaDaNatureza(f.natureza); if (c) setF((x) => Object.assign({}, x, { conta: c })); } }} />
          <datalist id="fl-naturezas">{opcoes.naturezas.map((n) => <option key={n.nome} value={n.nome}>{n.conta ? "conta " + n.conta : ""}</option>)}</datalist>
        </Campo>
        <Campo rotulo="Conta contábil" id="fl-conta"><input id="fl-conta" inputMode="numeric" value={f.conta} onChange={muda("conta")} autoComplete="off" /></Campo>

        <Campo rotulo="Cliente / fornecedor" id="fl-nome" className="col-span-2">
          <input id="fl-nome" list="fl-nomes" value={f.nome} onChange={muda("nome")} autoComplete="off" />
          <datalist id="fl-nomes">{opcoes.nomes.map((n) => <option key={n} value={n} />)}</datalist>
        </Campo>
        <Campo rotulo="CPF/CNPJ" id="fl-cpf"><input id="fl-cpf" value={f.cpf} onChange={muda("cpf")} autoComplete="off" /></Campo>
        <Campo rotulo="Modelo do doc." id="fl-mod">
          <select id="fl-mod" value={f.modelo} onChange={muda("modelo")}>
            <option value="">—</option>
            {comOpcao(opcoes.modelos, f.modelo).map((c) => <option key={c}>{c}</option>)}
          </select>
        </Campo>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
      {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
      {!editando && <p className="text-[12.5px] text-muted">Depois de adicionar, a janela fica aberta com a data, a categoria e a unidade, para lançar o próximo.</p>}
    </Janela>
  );
}
