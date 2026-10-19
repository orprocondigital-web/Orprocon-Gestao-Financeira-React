import { useEffect, useState } from "react";
import { AuthCore } from "../lib/legado.js";
import { useAuth } from "../lib/auth.jsx";
import { useAvisos } from "./Avisos.jsx";
import Janela from "./Janela.jsx";

/** "Trocar a minha senha" (botão do cadeado no menu). */
export default function TrocarSenha({ aberta, aoFechar }) {
  const { auth } = useAuth();
  const { aviso } = useAvisos();
  const [atual, setAtual] = useState(""), [n1, setN1] = useState(""), [n2, setN2] = useState(""), [erro, setErro] = useState(""), [ocupado, setOcupado] = useState(false);
  useEffect(() => { if (aberta) { setAtual(""); setN1(""); setN2(""); setErro(""); } }, [aberta]);
  const salvar = () => {
    const p = AuthCore.problemaSenha(n1);
    if (p) { setErro(p); return; }
    if (n1 !== n2) { setErro("As duas senhas não são iguais."); return; }
    setOcupado(true);
    auth.trocarSenha(atual, n1).then(() => { aoFechar(); aviso("Senha alterada."); })
      .catch((e) => setErro(e.message)).finally(() => setOcupado(false));
  };
  return (
    <Janela aberta={aberta} titulo="Trocar a minha senha" aoFechar={aoFechar} largura="max-w-[400px]"
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
        <button type="button" className="btn-primario" disabled={ocupado} onClick={salvar}>Salvar nova senha</button></>}>
      <form className="contents" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
        <div className="space-y-1.5"><label className="rotulo" htmlFor="senha-atual">Senha atual</label>
          <input id="senha-atual" type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} /></div>
        <div className="space-y-1.5"><label className="rotulo" htmlFor="senha-nova">Nova senha</label>
          <input id="senha-nova" type="password" autoComplete="new-password" value={n1} onChange={(e) => setN1(e.target.value)} />
          <span className="text-[12px] text-muted">Pelo menos 8 caracteres, com letras e números.</span></div>
        <div className="space-y-1.5"><label className="rotulo" htmlFor="senha-nova2">Repita a nova senha</label>
          <input id="senha-nova2" type="password" autoComplete="new-password" value={n2} onChange={(e) => setN2(e.target.value)} /></div>
        {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
        <button type="submit" hidden />
      </form>
    </Janela>
  );
}
