import { useEffect, useMemo, useState } from "react";
import { Conciliacao as RegrasConc, Core, Importacao, Store } from "../../lib/legado.js";
import {
  CHAVE_AVULSA, PREFIXO_SALVA, avulsaVazia, calcular, gruposConferidos, grupoManual, juntarExtratos,
  listarSalvas, nomeSugerido, salvarAvulsa, trabalhoNaoSalvo
} from "../../lib/conciliar.mjs";
import { baixarArquivos, lerArquivoExtrato, lerPlanilha } from "../../lib/leitores.js";
import { useAvisos } from "../Avisos.jsx";
import { BotaoArquivo, Campo, Mensagem, Segmentado, numero } from "../contabil/ui.jsx";
import { BarraSelecao, JanelaObs, Resumo, Tabela } from "./Resultado.jsx";

/*
 * Conciliação avulsa: o extrato do banco (um ou vários arquivos) contra uma planilha de contas pagas a
 * fornecedores ou recebidas de clientes, sem conta cadastrada. As colunas da planilha são reconhecidas
 * pelo nome; valores iguais no mesmo período são desempatados pelo CNPJ ou pelo nome no histórico.
 * Tudo é salvo a cada mudança (volta depois de F5) e pode ser salvo com nome para reabrir depois.
 */
const POR_PAGINA = 400;
const NOMES_COL = { data: "data", valor: "valor", doc: "documento", nome: "fornecedor/cliente", cpf: "CNPJ" };

function carregar() {
  const e = Store.get(CHAVE_AVULSA);
  return e ? Object.assign(avulsaVazia(), e, { manuais: e.manuais || [] }) : avulsaVazia();
}

export default function ConciliacaoAvulsa() {
  const { aviso, confirmar } = useAvisos();
  const [av, setAvEstado] = useState(carregar);
  const [salvas, setSalvas] = useState(() => listarSalvas(Store));
  const [escolhida, setEscolhida] = useState("");
  const [filtro, setFiltro] = useState("");
  const [msg, setMsg] = useState({ texto: "", tipo: "info" });
  const [selecao, setSelecao] = useState({ ext: {}, sis: {} });
  const [pedido, setPedido] = useState(null);
  const [limite, setLimite] = useState(POR_PAGINA);

  // cada mudança vai para o Store na hora: F5 ou fechar a página não perde o trabalho
  const setAv = (mudar) => setAvEstado((atual) => {
    const novo = typeof mudar === "function" ? mudar(atual) : mudar;
    if (novo.extrato || novo.rows) Store.set(CHAVE_AVULSA, Object.assign({}, novo, { em: new Date().toISOString() }));
    else Store.remove(CHAVE_AVULSA);
    return novo;
  });
  const limparSelecao = () => setSelecao({ ext: {}, sis: {} });

  // planilha → títulos (refeito quando muda o tipo)
  const plan = useMemo(() => {
    if (!av.rows) return null;
    if (av.nfe || RegrasConc.ehBalancete(av.rows)) return { erro: "Esta conciliação usa NF-e ou o balancete de fornecedores, que por enquanto só abrem na versão anterior." };
    const r = RegrasConc.lerPlanilhaTitulos(av.rows, av.tipo);
    return r.ok ? r : { erro: r.erro };
  }, [av.rows, av.nfe, av.tipo]);
  const titulos = plan && plan.itens;

  const r = useMemo(() => (av.extrato && titulos
    ? calcular({ Core, Conciliacao: RegrasConc, extrato: av.extrato, sistema: titulos, grupos: av.manuais, tolerancia: av.tolerancia, filtro, avulso: true })
    : null), [av.extrato, titulos, av.manuais, av.tolerancia, filtro]);

  useEffect(() => { if (plan && plan.erro) setMsg({ texto: plan.erro, tipo: "erro" }); }, [plan]);

  const lerExtratos = async (files) => {
    setMsg({ texto: "Lendo " + files.length + " arquivo(s)…", tipo: "info" });
    const j = juntarExtratos(await Promise.all(files.map(lerArquivoExtrato)));
    if (!j.itens.length) {
      setMsg({ texto: j.erros.length ? j.erros.map((l) => l.arquivo + ": " + l.erro).join(" ") : "Nenhuma movimentação reconhecida no arquivo.", tipo: "erro" });
      return;
    }
    setAv((a) => Object.assign({}, a, { extrato: j.itens, formato: j.formato, conferencia: j.conferencia, extratoNome: files.map((f) => f.name).join(", ") }));
    limparSelecao(); setLimite(POR_PAGINA);
    setMsg({ texto: numero(j.itens.length) + " movimentação(ões) lidas (" + j.formato + ")" + j.conferencia + ".", tipo: j.conferencia.indexOf("atenção") > -1 || j.erros.length ? "aviso" : "info" });
  };
  const lerTitulos = async (file) => {
    setMsg({ texto: "Lendo " + file.name + "…", tipo: "info" });
    try {
      const rows = /\.(csv|txt)$/i.test(file.name)
        ? Core.textToRows(Core.decodeText(new Uint8Array(await file.arrayBuffer())))
        : (await lerPlanilha(file))[0].rows;
      setAv((a) => Object.assign({}, a, { rows, nfe: null, planilhaNome: file.name }));
      limparSelecao(); setLimite(POR_PAGINA); setMsg({ texto: "" });
    } catch (err) {
      setMsg({ texto: "Não consegui ler a planilha: " + (err.message || err), tipo: "erro" });
    }
  };

  const gravarManuais = (g) => { setAv((a) => Object.assign({}, a, { manuais: g })); limparSelecao(); };
  const alternar = (lado, chave) => setSelecao((s) => {
    const n = { ext: Object.assign({}, s.ext), sis: Object.assign({}, s.sis) };
    if (n[lado][chave]) delete n[lado][chave]; else n[lado][chave] = true;
    return n;
  });
  const vivos = useMemo(() => {
    const v = { ext: [], sis: [] };
    if (r) r.linhas.forEach((l) => { if (l.lado && selecao[l.lado][l.chave]) v[l.lado].push(l.chave); });
    return v;
  }, [r, selecao]);
  const juntar = (dif) => {
    const antes = av.manuais;
    const fazer = (obs) => { gravarManuais(antes.concat(grupoManual(vivos.ext, vivos.sis, obs))); setPedido(null); aviso("Conciliado à mão.", { desfazer: () => gravarManuais(antes) }); };
    if (dif === 0) { fazer(""); return; }
    setPedido({ titulo: "Os valores não batem", botao: "Conciliar assim", rotulo: "Motivo", exemplo: "juros, desconto, pagamento parcial…",
      texto: "A diferença é de " + Core.formatBR(dif / 100) + ". Se estiver certo, escreva o motivo e confirme.", ok: fazer });
  };
  const conferir = () => {
    const antes = av.manuais, n = vivos.ext.length + vivos.sis.length;
    setPedido({ titulo: "Marcar como conferido", botao: "Marcar " + n + " item(ns)", rotulo: "Observação (opcional)", exemplo: "tarifa bancária, folha de pagamento…",
      texto: n + " item(ns) ficam como conferidos, sem par. Dá para desfazer depois.",
      ok: (obs) => { gravarManuais(antes.concat(gruposConferidos(vivos.ext, vivos.sis, obs))); setPedido(null); aviso("Marcado como conferido.", { desfazer: () => gravarManuais(antes) }); } });
  };
  const desfazer = (idx) => {
    const antes = av.manuais, g = antes.slice(); g.splice(idx, 1);
    gravarManuais(g); aviso("Desfeito: os itens voltaram para a conciliação.", { desfazer: () => gravarManuais(antes) });
  };

  const salvar = () => {
    if (!r) { aviso("Escolha o extrato e a planilha antes de salvar."); return; }
    setPedido({ titulo: av.salvaId ? "Salvar alterações" : "Salvar conciliação", botao: "Salvar", rotulo: "Nome", exemplo: "Fan Metal – Julho de 2026",
      inicial: nomeSugerido(av, Importacao.nomeCompetencia),
      texto: "A conciliação fica guardada no sistema, com o extrato, a planilha e o que foi feito à mão, e entra no backup do Master." + (av.salvaId ? " Com outro nome, vira uma conciliação nova." : ""),
      ok: (nome) => {
        const e = salvarAvulsa(Store, av, nome || nomeSugerido(av, Importacao.nomeCompetencia));
        setAv(e); setSalvas(listarSalvas(Store)); setEscolhida(e.salvaId); setPedido(null);
        aviso("Conciliação salva: " + e.salvaNome + ".");
      } });
  };
  const abrir = async () => {
    const e = escolhida && Store.get(PREFIXO_SALVA + escolhida);
    if (!e) return;
    if (av.salvaId !== escolhida && trabalhoNaoSalvo(Store, av) &&
      !(await confirmar({ titulo: "Abrir outra conciliação?", botao: "Abrir mesmo assim", texto: "A conciliação aberta tem itens feitos à mão que não foram salvos." }))) return;
    setAv(Object.assign(avulsaVazia(), e, { manuais: e.manuais || [] }));
    limparSelecao(); setFiltro(""); setLimite(POR_PAGINA); setMsg({ texto: "" });
    aviso("Aberta: " + (e.salvaNome || "conciliação") + ".");
  };
  const excluir = async () => {
    const e = escolhida && Store.get(PREFIXO_SALVA + escolhida);
    if (!e || !(await confirmar({ titulo: "Excluir a conciliação salva?", botao: "Excluir", texto: "\"" + (e.salvaNome || "") + "\" sai da lista. Não dá para desfazer." }))) return;
    Store.remove(PREFIXO_SALVA + escolhida);
    if (av.salvaId === escolhida) setAv((a) => Object.assign({}, a, { salvaId: null, salvaNome: "" }));
    setSalvas(listarSalvas(Store)); setEscolhida("");
    aviso("Conciliação excluída.");
  };
  const exportar = () => {
    if (!r) return;
    baixarArquivos([{ nome: "conciliacao-planilha-" + new Date().toISOString().slice(0, 10) + ".csv", conteudo: RegrasConc.csvResultado(r.linhas, "Planilha"), tipo: "text/csv;charset=utf-8" }]);
  };
  const limpar = async () => {
    if (trabalhoNaoSalvo(Store, av) &&
      !(await confirmar({ titulo: "Limpar a conciliação?", botao: "Limpar mesmo assim", texto: "Há itens conciliados à mão que não foram salvos. Se quiser guardar, cancele e use \"Salvar conciliação\"." }))) return;
    setAv(avulsaVazia(av.tolerancia)); limparSelecao(); setFiltro(""); setEscolhida(""); setMsg({ texto: "" });
  };

  const receb = av.tipo === "recebimentos";
  const naoSalvo = trabalhoNaoSalvo(Store, av);
  const fora = r && av.extrato ? av.extrato.filter((e) => e.sign === (receb ? "D" : "C")).length : 0;
  const notas = r ? [
    fora ? numero(fora) + (receb ? " saída(s)" : " entrada(s)") + " do extrato ficam fora (a planilha é de " + (receb ? "recebimentos" : "pagamentos") + ")." : "",
    r.aVencer.length ? numero(r.aVencer.length) + " título(s) da planilha vencem depois do extrato (" + Core.formatBR(r.somaAVencer) + ") e não contam como pendência." : ""
  ] : [];

  return (
    <div className="space-y-4">
      <section className="cartao p-4 sm:p-5 space-y-4">
        <p className="text-[13.5px] text-muted max-w-[760px]">Cruza o extrato com uma planilha de contas pagas a fornecedores ou recebidas de clientes, sem conta cadastrada. As colunas (data de pagamento, valor pago, NF, fornecedor, CNPJ) são reconhecidas pelo nome. O trabalho fica salvo enquanto você mexe.</p>
        <div className="space-y-1.5">
          <span className="rotulo block">A planilha é de</span>
          <Segmentado rotulo="A planilha é de" valor={av.tipo} aoMudar={(t) => { setAv((a) => Object.assign({}, a, { tipo: t })); limparSelecao(); }}
            opcoes={[["pagamentos", "Pagamentos a fornecedores"], ["recebimentos", "Recebimentos de clientes"]]} pequeno />
        </div>
        <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px] gap-3 items-end">
          <Campo rotulo="1. Extrato do banco" id="av-extrato" dica={av.extratoNome || "PDF, OFX, TXT, CSV ou planilha; pode escolher vários"}>
            <BotaoArquivo className={(av.extrato ? "btn-contorno" : "btn-primario") + " h-10 w-full"} aceita=".pdf,.ofx,.txt,.csv,.xlsx,.xlsm,.xls" multiplo aoEscolher={lerExtratos}>
              {av.extrato ? "Trocar o extrato" : "Escolher o extrato"}</BotaoArquivo>
          </Campo>
          <Campo rotulo="2. Planilha" id="av-planilha" dica={av.planilhaNome || ".xlsx, .xls ou .csv"}>
            <BotaoArquivo className={(av.rows ? "btn-contorno" : "btn-primario") + " h-10 w-full"} aceita=".xlsx,.xlsm,.xls,.csv,.txt" aoEscolher={lerTitulos}>
              {av.rows ? "Trocar a planilha" : "Escolher a planilha"}</BotaoArquivo>
          </Campo>
          <Campo rotulo="Tolerância de data" id="av-tol">
            <div className="flex items-center gap-2"><input id="av-tol" type="number" min="0" max="15" value={av.tolerancia}
              onChange={(e) => setAv((a) => Object.assign({}, a, { tolerancia: e.target.value }))} className="w-20" /><span className="text-[13px] text-muted">dias</span></div>
          </Campo>
        </div>
        {(av.extrato || av.rows) && (
          <ul className="text-[13px] text-muted space-y-0.5">
            {av.salvaNome && <li>Conciliação: <strong className="text-ink-2">{av.salvaNome}</strong> {naoSalvo ? <span className="text-warn">(com alterações não salvas)</span> : "(salva)"}</li>}
            {av.extrato && <li>Extrato: {numero(av.extrato.length)} movimentação(ões) ({av.formato}){av.conferencia}.</li>}
            {titulos && <li>Planilha: {numero(titulos.length)} título(s). Colunas usadas: {Object.keys(plan.colunas).map((k) => NOMES_COL[k] + " = \"" + plan.colunas[k] + "\"").join(", ")}.</li>}
            {av.extrato && !av.rows && <li className="text-ink-2">Agora escolha a planilha.</li>}
            {!av.extrato && av.rows && <li className="text-ink-2">Agora escolha o extrato.</li>}
          </ul>
        )}
        {salvas.length > 0 && (
          <div className="flex flex-wrap items-end gap-2 pt-3 border-t border-line">
            <Campo rotulo="Conciliações salvas" id="av-salvas" className="flex-1 min-w-[240px] max-w-[520px]">
              <select id="av-salvas" value={escolhida} onChange={(e) => setEscolhida(e.target.value)}>
                <option value="">Escolha…</option>
                {salvas.map((s) => <option key={s.id} value={s.id}>{s.nome}{s.em ? " — salva em " + new Date(s.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</option>)}
              </select>
            </Campo>
            <button type="button" className="btn-contorno h-10" disabled={!escolhida} onClick={abrir}>Abrir</button>
            <button type="button" className="btn-fantasma h-10" disabled={!escolhida} onClick={excluir}>Excluir</button>
          </div>
        )}
      </section>
      <Mensagem texto={msg.texto} tipo={msg.tipo} aoFechar={() => setMsg({ texto: "" })} />

      {r && (<>
        <Resumo r={r} avulso notas={notas} />
        <div className="flex flex-wrap items-center gap-2">
          <input type="search" value={filtro} onChange={(e) => { setFiltro(e.target.value); setLimite(POR_PAGINA); }} placeholder="Buscar fornecedor, histórico, NF…" aria-label="Buscar na conciliação" className="max-w-[340px] h-9" />
          <div className="flex-1" />
          <button type="button" className="btn-primario btn-sm" onClick={salvar}>{av.salvaId ? "Salvar alterações" : "Salvar conciliação"}</button>
          <button type="button" className="btn-contorno btn-sm" onClick={exportar}>Baixar resultado (CSV)</button>
          <button type="button" className="btn-fantasma btn-sm" onClick={limpar}>Limpar</button>
        </div>
        <Tabela r={r} avulso selecao={selecao} alternar={alternar} desfazer={desfazer} limite={limite} mostrarMais={() => setLimite((x) => x + POR_PAGINA)}
          descSistema={(s, confere) => (<>
            <span className="block">{s.nome || s.desc || "—"}</span>
            {(s.doc || s.cpf) && <span className="block text-[12px] text-muted">{[s.doc && "NF " + s.doc, s.cpf].filter(Boolean).join(" · ")}</span>}
            {confere && <span className="block text-[12px] font-semibold text-credit">✓ no histórico</span>}
          </>)} />
        <BarraSelecao avulso itensExt={vivos.ext.map((k) => r.itemDe("ext", k))} itensSis={vivos.sis.map((k) => r.itemDe("sis", k))}
          aoJuntar={juntar} aoConferir={conferir} aoCancelar={limparSelecao} />
      </>)}
      {!r && (av.extrato || av.rows) && (
        <div className="flex justify-end"><button type="button" className="btn-fantasma btn-sm" onClick={limpar}>Limpar</button></div>
      )}
      <JanelaObs pedido={pedido} aoFechar={() => setPedido(null)} />
    </div>
  );
}
