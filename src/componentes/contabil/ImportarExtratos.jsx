import { useEffect, useState } from "react";
import { nomeDaFonte } from "../../lib/contabil.mjs";
import { contabil } from "../../lib/useContabil.js";
import { lerArquivoExtrato } from "../../lib/leitores.js";
import Janela from "../Janela.jsx";
import { BotaoArquivo, dataBR, numero } from "./ui.jsx";

/**
 * Extratos do banco (PDF, OFX, TXT, CSV, planilha): cada arquivo vai para a conta certa (pelo número
 * que vem no extrato), sem duplicar o que já foi importado e com a classificação sugerida pelo histórico.
 * contaFixa: aberto de dentro de uma conta, já vem com ela escolhida.
 */
export default function ImportarExtratos({ aberta, contaFixa, aoFechar, aoConcluir }) {
  const [lidos, setLidos] = useState([]);
  const [status, setStatus] = useState("");
  useEffect(() => { if (aberta) { setLidos([]); setStatus(""); } }, [aberta]);
  if (!aberta) return null;
  const bancos = contabil.bancos();

  const ler = async (files) => {
    setStatus("Lendo " + files.length + " arquivo(s)…"); setLidos([]);
    const r = await Promise.all(files.map(lerArquivoExtrato));
    setLidos(contabil.prepararExtratos(r, contaFixa || ""));
    setStatus("");
  };
  const escolherConta = (i, contaId) => setLidos((l) => l.map((x, k) => (k === i ? Object.assign({}, x, { contaId }) : x)));
  const pode = lidos.some((l) => !l.erro && l.contaId && l.itens.length);
  const confirmar = () => {
    const r = contabil.confirmarExtratos(lidos);
    aoFechar();
    if (aoConcluir) aoConcluir(r);
  };

  return (
    <Janela aberta titulo="Importar extratos do banco" aoFechar={aoFechar} largura="max-w-[680px]"
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
        <button type="button" className="btn-primario" disabled={!pode} onClick={confirmar}>Importar</button></>}>
      <p className="text-[13.5px] text-ink-2">Escolha um ou mais arquivos: PDF do internet banking, OFX, TXT do Sicoob, CSV ou planilha.
        Pode importar o mesmo extrato de novo no mês: o que já existe não é duplicado.</p>
      {!bancos.length && <p className="text-[13px] text-warn">Nenhuma conta bancária cadastrada ainda. Cadastre a conta (ou importe a planilha do mês) antes.</p>}
      <div><BotaoArquivo className="btn-contorno" aceita=".pdf,.ofx,.txt,.csv,.xlsx,.xls" multiplo aoEscolher={ler}>Escolher arquivos</BotaoArquivo></div>
      {status && <p className="text-[13px] text-muted" role="status">{status}</p>}
      {lidos.map((l, i) => {
        if (l.erro) return (
          <div key={i} className="rounded-lg border border-debit/30 bg-debit-soft px-3 py-2.5">
            <strong className="block text-[13.5px] break-all">{l.arquivo}</strong>
            <span className="text-[13px] text-debit">{l.erro}</span>
          </div>
        );
        const p = contabil.previaExtrato(l);
        const datas = l.itens.map((x) => x.data).sort();
        const conf = l.conferencia && l.conferencia.total ? l.conferencia : null;
        return (
          <div key={i} className="rounded-lg border border-line px-3 py-2.5 space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <strong className="text-[13.5px] break-all">{l.arquivo}</strong>
              <span className="text-[12.5px] text-muted">{l.formato}{l.numeroConta ? " · conta " + l.numeroConta : ""}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
              <span>{numero(l.itens.length)} lançamentos</span>
              {datas.length > 0 && <span>{dataBR(datas[0])} a {dataBR(datas[datas.length - 1])}</span>}
              {l.contaId && <span><strong>{numero(p.novos)}</strong> novos{p.repetidos ? ", " + numero(p.repetidos) + " já importados" : ""}</span>}
              {conf && (conf.conferidos === conf.total
                ? <span className="text-credit">Saldos conferidos em {conf.total} dia(s)</span>
                : <span className="text-debit">Saldo não fecha em {conf.total - conf.conferidos} de {conf.total} dia(s): confira o extrato</span>)}
            </div>
            <label className="block space-y-1">
              <span className="rotulo">Conta no sistema</span>
              <select value={l.contaId || ""} onChange={(e) => escolherConta(i, e.target.value)}>
                <option value="">Escolha a conta…</option>
                {bancos.map((b) => <option key={b.id} value={b.id}>{nomeDaFonte(b)}{l.candidatas.indexOf(b.id) > -1 ? " (número bate)" : ""}</option>)}
              </select>
            </label>
            {l.candidatas.length > 1 && <p className="text-[12.5px] text-muted">Mais de uma conta tem esse número: escolha a certa.</p>}
            {!l.candidatas.length && l.numeroConta && <p className="text-[12.5px] text-muted">Nenhuma conta cadastrada com o número {l.numeroConta}. Escolha a conta ou cadastre-a antes.</p>}
          </div>
        );
      })}
    </Janela>
  );
}
