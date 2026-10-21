import { useEffect, useRef, useState } from "react";
import { Core } from "../../lib/legado.js";
import Icone from "../Icone.jsx";

/** Peças pequenas das telas da Integração contábil. */

export const formatarValor = (v) => Core.formatBR(Math.abs(v || 0));
export const dataBR = (iso) => Core.brDate(iso);
export const numero = (x) => Number(x || 0).toLocaleString("pt-BR");

/** 1.234,56C em verde ou 1.234,56D em vermelho (o jeito da planilha). */
export function Valor({ valor, sinal, className = "" }) {
  return <span className={"tabular-nums font-medium " + (sinal === "D" ? "text-debit " : "text-credit ") + className}>{formatarValor(valor)}{sinal}</span>;
}
/** Saldo com sinal: positivo = C. */
export function Saldo({ valor }) { return <Valor valor={valor} sinal={valor >= 0 ? "C" : "D"} />; }

export function Selo({ tipo = "neutro", children, title }) {
  const cor = {
    pendente: "bg-warn-soft text-warn", sugerida: "bg-info-soft text-info", erro: "bg-debit-soft text-debit",
    ok: "bg-ok-soft text-credit", novo: "bg-brand-soft text-brand", neutro: "bg-surface-2 text-muted border border-line"
  }[tipo];
  return <span title={title} className={"inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold align-middle " + cor}>{children}</span>;
}

/** Botão que abre a escolha de arquivo (o input fica escondido). */
export function BotaoArquivo({ aoEscolher, aceita, multiplo, children, className = "btn-contorno", disabled, icone }) {
  const ref = useRef(null);
  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => ref.current && ref.current.click()}>
        {icone && <Icone nome={icone} />}{children}
      </button>
      <input ref={ref} type="file" hidden accept={aceita} multiple={multiplo}
        onChange={(e) => { const f = e.target.files; if (f && f.length) aoEscolher(multiplo ? Array.from(f) : f[0]); e.target.value = ""; }} />
    </>
  );
}

export function Campo({ rotulo, id, children, dica, className = "" }) {
  return (
    <div className={"space-y-1.5 min-w-0 " + className}>
      <label className="rotulo" htmlFor={id}>{rotulo}</label>
      {children}
      {dica && <p className="text-[12px] text-muted">{dica}</p>}
    </div>
  );
}

/** Escolha entre poucas opções lado a lado (C/D, Todos/Pendentes…). */
export function Segmentado({ opcoes, valor, aoMudar, rotulo, pequeno }) {
  return (
    <div className={"inline-flex p-1 gap-1 rounded-lg bg-surface-2 border border-line max-w-full overflow-x-auto " + (pequeno ? "" : "w-full")} role="radiogroup" aria-label={rotulo}>
      {opcoes.map(([id, nome, cls]) => (
        <button key={id} type="button" role="radio" aria-checked={valor === id} onClick={() => aoMudar(id)}
          className={"flex-1 whitespace-nowrap rounded-md px-3 py-1 text-[13.5px] " + (valor === id ? "bg-surface font-semibold shadow-sm " + (cls || "text-brand") : "text-ink-2 hover:text-ink")}>{nome}</button>
      ))}
    </div>
  );
}

/** Campo de texto que grava ao sair (ou com Enter), sem botão Salvar: para tabelas que se editam como planilha. */
export function TextoRapido({ valor, aoGravar, rotulo, lista, placeholder, className = "" }) {
  const [v, setV] = useState(valor || "");
  useEffect(() => { setV(valor || ""); }, [valor]);
  return <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v.trim() !== (valor || "")) aoGravar(v); }}
    onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} aria-label={rotulo} list={lista} placeholder={placeholder}
    className={"h-8 px-2 text-[13px] border-transparent bg-transparent hover:border-line focus:bg-surface " + className} />;
}

/** Faixa de mensagem dentro da tela (resultado de importação, aviso). */
export function Mensagem({ texto, tipo = "info", aoFechar }) {
  if (!texto) return null;
  const cor = tipo === "aviso" ? "bg-warn-soft text-warn border-warn/30" : tipo === "erro" ? "bg-debit-soft text-debit border-debit/30" : "bg-info-soft text-info border-info/30";
  return (
    <div role="status" className={"flex items-start gap-3 rounded-lg border px-3.5 py-2.5 text-[13.5px] leading-relaxed " + cor}>
      <span className="flex-1">{texto}</span>
      {aoFechar && <button type="button" onClick={aoFechar} aria-label="Fechar a mensagem" className="-mr-1 h-6 w-6 inline-flex items-center justify-center rounded hover:bg-black/5"><Icone nome="fechar" className="w-4 h-4" /></button>}
    </div>
  );
}

/** Número grande com rótulo, para as faixas de totais. */
export function Numero({ rotulo, children }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-muted">{rotulo}</div>
      <div className="text-[16px] font-semibold tabular-nums truncate">{children}</div>
    </div>
  );
}
