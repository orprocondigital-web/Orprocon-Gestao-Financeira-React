import { useState } from "react";
import { mensagemRenovacao } from "../../lib/depCadastro.mjs";
import { useAuth } from "../../lib/auth.jsx";
import { useAvisos } from "../Avisos.jsx";
import Janela from "../Janela.jsx";
import { Campo } from "../contabil/ui.jsx";

/**
 * Mensagem pronta para o cliente sobre a renovação de um documento: dá para ajustar o texto,
 * copiar, abrir no e-mail ou no WhatsApp (com o e-mail/telefone do cadastro da empresa, quando houver).
 */
export default function Mensagem({ doc, aoFechar }) {
  const { usuario } = useAuth();
  const { aviso } = useAvisos();
  const assinatura = (usuario && usuario.nome && !usuario.teste ? usuario.nome + " - " : "") + "Orprocon Empresa Contábil";
  const [m] = useState(() => mensagemRenovacao(doc, assinatura));
  const [assunto, setAssunto] = useState(m.assunto);
  const [texto, setTexto] = useState(m.texto);
  const email = (doc.contato && doc.contato.email) || "";
  const fone = String((doc.contato && doc.contato.telefone) || "").replace(/\D/g, "");
  const foneWa = fone.length === 10 || fone.length === 11 ? "55" + fone : fone;
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); aviso("Mensagem copiada."); }
    catch (e) { aviso("Não consegui copiar: selecione o texto e use Ctrl+C."); }
  };
  const abrir = (url) => { window.open(url, "_blank", "noopener"); };
  const mailto = "mailto:" + encodeURIComponent(email) + "?subject=" + encodeURIComponent(assunto) + "&body=" + encodeURIComponent(texto);
  const wa = "https://wa.me/" + (foneWa.length >= 12 ? foneWa : "") + "?text=" + encodeURIComponent(texto);
  return (
    <Janela aberta titulo={"Mensagem para " + doc.empresa} aoFechar={aoFechar} largura="max-w-[640px]"
      rodape={<>
        <button type="button" className="btn-fantasma" onClick={aoFechar}>Fechar</button>
        <button type="button" className="btn-contorno" onClick={() => abrir(wa)}>WhatsApp</button>
        <button type="button" className="btn-contorno" onClick={() => abrir(mailto)}>E-mail</button>
        <button type="button" className="btn-primario" onClick={copiar}>Copiar</button>
      </>}>
      <Campo rotulo="Assunto (e-mail)" id="msg-assunto"><input id="msg-assunto" value={assunto} onChange={(e) => setAssunto(e.target.value)} autoComplete="off" /></Campo>
      <Campo rotulo="Mensagem" id="msg-texto"><textarea id="msg-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={13} className="w-full text-[13.5px] leading-relaxed" data-foco /></Campo>
      <p className="text-[12.5px] text-muted">
        {email ? "E-mail: " + email : "Sem e-mail no cadastro da empresa"} · {foneWa.length >= 12 ? "WhatsApp: " + doc.contato.telefone : "sem telefone (o WhatsApp abre para escolher o contato)"}.
        {" "}Cadastre o contato em Empresas para preencher sozinho.
      </p>
    </Janela>
  );
}
