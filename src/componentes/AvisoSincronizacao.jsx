import { useEffect, useState } from "react";
import { atualizarDoServidor } from "../lib/sincronizacao.js";
import Icone from "./Icone.jsx";

/*
 * O que está acontecendo com os dados no servidor (eventos "gf-sinc" de sincronizacao.js):
 * salvando / salvo (some sozinho), sem conexão (tenta de novo), conflito (outra pessoa salvou antes) e
 * novidades (outra pessoa mudou algo enquanto esta aba estava aberta).
 */
const NOMES = { "painelVencimentos": "Departamento Cadastro", "depCadastro": "Departamento Cadastro", "emDia": "Em Dia", "lucros": "Lucros e REINF",
  "encerramento": "Encerramento", "iss": "ISS", "horas": "Controle de horas", "icms": "ICMS", "ibscbs": "Auditor IBS/CBS" };
const nomeDa = (k) => NOMES[String(k || "").split(/[:.]/)[0]] || "dados";

export default function AvisoSincronizacao() {
  const [ev, setEv] = useState(null);
  useEffect(() => {
    let timer;
    const ouvir = (e) => {
      const d = e.detail || {};
      if (d.tipo === "recusado") return;   // sem permissão para aquela chave: fica só neste navegador
      clearTimeout(timer);
      setEv(d);
      if (d.tipo === "salvo") timer = setTimeout(() => setEv(null), 1500);
    };
    window.addEventListener("gf-sinc", ouvir);
    return () => { window.removeEventListener("gf-sinc", ouvir); clearTimeout(timer); };
  }, []);
  if (!ev) return null;

  const base = "fixed right-4 bottom-4 z-[56] max-w-[calc(100vw-32px)] flex items-center gap-3 rounded-xl pl-4 pr-2 py-2 shadow-pop text-[13.5px]";
  if (ev.tipo === "salvando" || ev.tipo === "salvo") {
    return (
      <div role="status" aria-live="polite" className={base + " bg-surface border border-line text-muted pr-4"}>
        <Icone nome={ev.tipo === "salvo" ? "ok" : "horas"} />
        <span>{ev.tipo === "salvo" ? "Salvo no servidor" : "Salvando no servidor…"}</span>
      </div>
    );
  }
  const textos = {
    erro: <><strong className="font-semibold">Sem conexão com o servidor.</strong> O que você fez está guardado aqui e vai ser enviado assim que ele responder.</>,
    "erro-inicio": <><strong className="font-semibold">Não consegui buscar os dados no servidor.</strong> Você está vendo o que tinha neste computador.</>,
    conflito: <><strong className="font-semibold">Outra pessoa salvou {nomeDa(ev.chave)} antes de você.</strong> A sua última alteração não foi salva: atualize e faça de novo.</>,
    novidades: <><strong className="font-semibold">Há alterações de outras pessoas</strong> em {[...new Set((ev.chaves || []).map(nomeDa))].join(", ")}.</>
  };
  const comBotao = ev.tipo === "conflito" || ev.tipo === "novidades" || ev.tipo === "erro-inicio";
  return (
    <div role="alert" className={base + " bg-grafite text-on-grafite"}>
      <span>{textos[ev.tipo] || null}</span>
      {comBotao && <button type="button" className="btn-primario btn-sm shrink-0" onClick={atualizarDoServidor}>Atualizar</button>}
      <button type="button" className="btn-sm shrink-0 opacity-80" aria-label="Fechar" onClick={() => setEv(null)}>✕</button>
    </div>
  );
}
