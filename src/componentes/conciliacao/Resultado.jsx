import { useState } from "react";
import { Core } from "../../lib/legado.js";
import { STATUS, somaCents } from "../../lib/conciliar.mjs";
import Janela from "../Janela.jsx";
import { Selo, Valor, dataBR, numero } from "../contabil/ui.jsx";

/*
 * Peças da tela de Conciliação usadas pelos dois modos (por conta e avulsa): resumo com a barra,
 * tabela lado a lado com a seleção para conciliar à mão, barra da seleção e a janela de observação.
 */
const COR = {
  ok: "bg-credit", data_diferente: "bg-warn", manual: "bg-info", justificado: "bg-muted",
  so_extrato: "bg-debit", so_sistema: "bg-brand-fill"
};
const SELO = { ok: "ok", data_diferente: "pendente", manual: "sugerida", justificado: "neutro", so_extrato: "erro", so_sistema: "novo" };
const ORDEM_LEGENDA = ["ok", "data_diferente", "manual", "justificado", "so_extrato", "so_sistema"];
const brl = (c) => Core.formatBR(c / 100);

export function rotuloStatus(st, avulso) { return st === "so_sistema" && avulso ? "Só na planilha" : STATUS[st]; }

export function Resumo({ r, avulso, notas }) {
  const res = r.resumo;
  const titulo = r.fechado ? "Conciliação fechada" : numero(r.pendentes) + (r.pendentes === 1 ? " pendência" : " pendências") + ", " + r.pct + "% conciliado";
  return (
    <section className="cartao p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className={"text-[17px] font-semibold " + (r.fechado ? "text-credit" : "")}>{titulo}</h2>
        <div className="text-[13.5px] text-muted">Diferença, banco menos {avulso ? "planilha" : "sistema"}{" "}
          <strong className={"tabular-nums " + (r.diferencaCents === 0 ? "text-credit" : "text-debit")}>{brl(r.diferencaCents)}</strong></div>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-line" role="img" aria-label={r.pct + "% conciliado"}>
        {ORDEM_LEGENDA.filter((k) => res[k] > 0).map((k) => <span key={k} className={COR[k]} style={{ flex: res[k] }} title={rotuloStatus(k, avulso) + ": " + res[k]} />)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
        {ORDEM_LEGENDA.filter((k) => res[k] > 0 || ["ok", "so_extrato", "so_sistema"].includes(k)).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5"><i className={"inline-block w-2.5 h-2.5 rounded-sm " + COR[k]} />{rotuloStatus(k, avulso)} <strong>{numero(res[k] || 0)}</strong></span>
        ))}
      </div>
      {(notas || []).filter(Boolean).map((n, i) => <p key={i} className="text-[12.5px] text-muted">{n}</p>)}
      {r.pendentes > 0 && <p className="text-[12.5px] text-muted">Pendente que está certo? Marque as caixinhas e use <strong>Conciliar selecionados</strong> (ex.: um débito que pagou vários boletos) ou <strong>Marcar como conferido</strong> (ex.: tarifa, sem par).</p>}
    </section>
  );
}

function Pilha({ itens, render }) {
  return itens.map((x, i) => <div key={i} className={i ? "mt-1.5 pt-1.5 border-t border-dashed border-line" : ""}>{render(x)}</div>);
}
function DescBanco({ e }) {
  const sub = [e.nome, e.cpfCnpj || e.cpf].filter(Boolean).join(", ");
  return <><span className="block">{e.desc}</span>{sub && <span className="block text-[12px] text-muted">{sub}</span>}</>;
}

/** Tabela lado a lado. descSistema(s, confere) desenha a coluna da direita (lançamento ou título da planilha). */
export function Tabela({ r, avulso, selecao, alternar, desfazer, descSistema, limite, mostrarMais }) {
  const vazioDir = avulso ? "Não está na planilha" : "Não lançado";
  if (!r.linhas.length) return <div className="cartao p-8 text-center text-muted">Nenhuma movimentação com esse filtro.</div>;
  return (
    <div className="cartao overflow-hidden">
      <div className="overflow-x-auto relative">
        <table className="w-full text-[13.5px]">
          <thead className="bg-surface-2 text-left text-[12px] uppercase tracking-wide text-muted">
            <tr>
              <th colSpan={3} className="px-3 pt-2.5 pb-0 font-semibold text-ink-2 normal-case text-[12.5px] tracking-normal">No banco (extrato)</th>
              <th className="px-3 pt-2.5 pb-0" />
              <th colSpan={3} className="px-3 pt-2.5 pb-0 font-semibold text-ink-2 normal-case text-[12.5px] tracking-normal border-l border-line">{avulso ? "Na planilha" : "Lançado no sistema"}</th>
            </tr>
            <tr>
              <th className="px-3 py-2 font-semibold">Data</th><th className="px-3 py-2 font-semibold">Descrição</th><th className="px-3 py-2 font-semibold text-right">Valor</th>
              <th className="px-3 py-2 font-semibold">Situação</th>
              <th className="px-3 py-2 font-semibold border-l border-line">Data</th><th className="px-3 py-2 font-semibold text-right">Valor</th>
              <th className="px-3 py-2 font-semibold">{avulso ? "Fornecedor / documento" : "Descrição"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {r.linhas.slice(0, limite).map((l, i) => {
              if (l.extratos) {   // conciliado à mão ou conferido
                const nota = [l.obs, l.diferencaCents ? "diferença " + brl(l.diferencaCents) : ""].filter(Boolean).join(" · ");
                return (
                  <tr key={"g" + l.grupo} className="align-top bg-info-soft/30">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums"><Pilha itens={l.extratos} render={(e) => dataBR(e.data)} /></td>
                    <td className="px-3 py-2 min-w-[200px]"><Pilha itens={l.extratos} render={(e) => <DescBanco e={e} />} /></td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{l.extratos.length ? <Pilha itens={l.extratos} render={(e) => <Valor valor={e.valorNum} sinal={e.sign} />} /> : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Selo tipo={SELO[l.status]}>{STATUS[l.status]}</Selo>
                      <button type="button" className="block mt-1 text-[12.5px] font-semibold text-brand hover:underline" onClick={() => desfazer(l.grupo)}>Desfazer</button>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums border-l border-line"><Pilha itens={l.sistemas} render={(s) => dataBR(s.data)} /></td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{l.sistemas.length ? <Pilha itens={l.sistemas} render={(s) => <Valor valor={s.valorNum} sinal={s.sign} />} /> : "—"}</td>
                    <td className="px-3 py-2 min-w-[200px]">
                      <Pilha itens={l.sistemas} render={(s) => descSistema(s, false)} />
                      {nota && <span className="block mt-1 text-[12px] italic text-muted">{nota}</span>}
                    </td>
                  </tr>
                );
              }
              const e = l.extrato, s = l.sistema;
              const pend = !!l.lado;
              const marcado = pend && !!selecao[l.lado][l.chave];
              return (
                <tr key={i + (l.chave || "")} className={"align-top " + (marcado ? "bg-brand-soft" : pend ? "hover:bg-surface-2" : "")}>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{e ? dataBR(e.data) : ""}</td>
                  <td className="px-3 py-2 min-w-[200px]">{e ? <DescBanco e={e} /> : ""}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{e ? <Valor valor={e.valorNum} sinal={e.sign} /> : <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <label className={"inline-flex items-center gap-2 " + (pend ? "cursor-pointer" : "")}>
                      {pend && <input type="checkbox" checked={marcado} onChange={() => alternar(l.lado, l.chave)} aria-label="Selecionar para conciliar à mão" />}
                      <Selo tipo={SELO[l.status]}>{rotuloStatus(l.status, avulso)}</Selo>
                    </label>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums border-l border-line">{s ? dataBR(s.data) : ""}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{s ? <Valor valor={s.valorNum} sinal={s.sign} /> : <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-2 min-w-[200px]">{s ? descSistema(s, l.nomeConfere) : <span className="text-muted">{vazioDir}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {r.linhas.length > limite && (
        <div className="border-t border-line p-3 text-center text-[13px] text-muted">
          Mostrando {numero(limite)} de {numero(r.linhas.length)}.{" "}
          <button type="button" className="btn-contorno btn-sm ml-2" onClick={mostrarMais}>Mostrar mais</button>
        </div>
      )}
    </div>
  );
}

/** Barra fixa embaixo quando há itens selecionados. */
export function BarraSelecao({ itensExt, itensSis, avulso, aoJuntar, aoConferir, aoCancelar }) {
  const nE = itensExt.length, nS = itensSis.length;
  if (!nE && !nS) return null;
  const sE = somaCents(itensExt), sS = somaCents(itensSis);
  const dif = sE - sS;
  return (
    <div className="sticky bottom-3 z-30 cartao shadow-pop pl-4 pr-16 sm:pr-[150px] py-3 flex flex-wrap items-center gap-3 border-brand-fill">
      <span className="flex-1 min-w-[220px] text-[13.5px]">
        Selecionados: <strong>{nE}</strong> do banco ({brl(Math.abs(sE))}) e <strong>{nS}</strong> {avulso ? "da planilha" : "do sistema"} ({brl(Math.abs(sS))})
        {nE > 0 && nS > 0 && <> · diferença <strong className={dif === 0 ? "text-credit" : "text-debit"}>{brl(dif)}</strong></>}
      </span>
      <button type="button" className="btn-fantasma btn-sm" onClick={aoCancelar}>Cancelar</button>
      <button type="button" className="btn-contorno btn-sm" onClick={aoConferir}>Marcar como conferido</button>
      <button type="button" className="btn-primario btn-sm" disabled={!(nE && nS)} onClick={() => aoJuntar(dif)}>Conciliar selecionados</button>
    </div>
  );
}

/** Pergunta a observação (motivo da diferença ou do "conferido"). */
export function JanelaObs({ pedido, aoFechar }) {
  const [obs, setObs] = useState("");
  if (!pedido) return null;
  const confirmar = () => { pedido.ok(obs.trim()); setObs(""); };
  return (
    <Janela aberta titulo={pedido.titulo} aoFechar={() => { setObs(""); aoFechar(); }}
      rodape={<><button type="button" className="btn-fantasma" onClick={() => { setObs(""); aoFechar(); }}>Cancelar</button>
        <button type="button" className="btn-primario" onClick={confirmar}>{pedido.botao}</button></>}>
      <p className="text-[14px] text-ink-2 leading-relaxed">{pedido.texto}</p>
      <label className="block space-y-1.5"><span className="rotulo">{pedido.rotulo}</span>
        <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder={pedido.exemplo} data-foco autoComplete="off"
          onKeyDown={(e) => { if (e.key === "Enter") confirmar(); }} /></label>
    </Janela>
  );
}
