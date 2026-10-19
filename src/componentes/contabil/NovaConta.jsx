import { useEffect, useState } from "react";
import { BANCOS } from "../../lib/contabil.mjs";
import { contabil } from "../../lib/useContabil.js";
import Janela from "../Janela.jsx";
import { Campo } from "./ui.jsx";

/** Nova conta bancária: o nome segue o padrão das abas da planilha ("SICOOB 24402-3 Conta 643"). */
export default function NovaConta({ aberta, aoFechar, aoCriar }) {
  const [f, setF] = useState({ banco: BANCOS[0], agencia: "", numero: "", contabil: "" });
  const [erro, setErro] = useState("");
  useEffect(() => { if (aberta) { setF({ banco: BANCOS[0], agencia: "", numero: "", contabil: "" }); setErro(""); } }, [aberta]);
  if (!aberta) return null;
  const muda = (c) => (e) => setF((x) => Object.assign({}, x, { [c]: e.target.value }));
  const salvar = (ev) => {
    ev.preventDefault();
    try { const c = contabil.criarConta(f); aoFechar(); if (aoCriar) aoCriar(c); } catch (e) { setErro(e.message); }
  };
  const previa = (f.banco || "").toUpperCase() + " " + (f.numero || "…").toUpperCase() + " Conta " + (f.contabil || "…");
  return (
    <Janela aberta titulo="Nova conta bancária" aoFechar={aoFechar}
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button><button type="submit" form="form-conta" className="btn-primario">Criar conta</button></>}>
      <form id="form-conta" onSubmit={salvar} className="grid grid-cols-2 gap-3">
        <Campo rotulo="Banco" id="nc-banco" className="col-span-2">
          <select id="nc-banco" value={f.banco} onChange={muda("banco")} data-foco>{BANCOS.map((b) => <option key={b}>{b}</option>)}</select>
        </Campo>
        <Campo rotulo="Agência" id="nc-ag"><input id="nc-ag" value={f.agencia} onChange={muda("agencia")} autoComplete="off" /></Campo>
        <Campo rotulo="Número da conta" id="nc-cc"><input id="nc-cc" value={f.numero} onChange={muda("numero")} placeholder="24402-3" autoComplete="off" /></Campo>
        <Campo rotulo="Conta contábil no Único" id="nc-ctb" className="col-span-2" dica="Só números, como no plano de contas do Único.">
          <input id="nc-ctb" inputMode="numeric" value={f.contabil} onChange={muda("contabil")} placeholder="643" autoComplete="off" />
        </Campo>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
      <p className="text-[12.5px] text-muted">Nome no sistema: <strong className="text-ink-2">{previa}</strong></p>
      {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
    </Janela>
  );
}
