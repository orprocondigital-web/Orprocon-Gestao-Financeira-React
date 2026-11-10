import { useEffect, useMemo, useRef, useState } from "react";
import { Conciliacao as RegrasConc, Core, Importacao, Store } from "../../lib/legado.js";
import {
  CHAVE_AVULSA, PREFIXO_SALVA, avulsaDoServidor, avulsaVazia, calcular, competenciaProvavel, depoisDeSalvar, gruposConferidos,
  grupoManual, juntarExtratos, listarSalvas, mudouDesdeOServidor, nomeSugerido, pedidoParaServidor, rotuloDaConciliacao,
  salvarAvulsa, trabalhoNaoSalvo
} from "../../lib/conciliar.mjs";
import {
  CONCILIACAO_NO_SERVIDOR as SRV, abrirConciliacao, criarConciliacao, excluirConciliacao, listarConciliacoes, salvarConciliacao
} from "../../lib/conciliacaoServidor.js";
import { empresaVisivelPorCnpj } from "../../lib/carteiraAtiva.js";
import { formatarDocumento } from "../../lib/certificado.mjs";
import { useDepCadastro } from "../../lib/useDepCadastro.js";
import { baixarArquivos, lerArquivoExtrato, lerPlanilha } from "../../lib/leitores.js";
import { useAvisos } from "../Avisos.jsx";
import { BotaoArquivo, Campo, Mensagem, Segmentado, numero } from "../contabil/ui.jsx";
import { BarraSelecao, JanelaObs, Resumo, Tabela } from "./Resultado.jsx";

/*
 * Conciliação avulsa: o extrato do banco (um ou vários arquivos) contra uma planilha de contas pagas a
 * fornecedores ou recebidas de clientes, sem conta cadastrada. As colunas da planilha são reconhecidas
 * pelo nome; valores iguais no mesmo período são desempatados pelo CNPJ ou pelo nome no histórico.
 * Tudo é salvo a cada mudança (volta depois de F5) e pode ser salvo com nome para reabrir depois.
 * Com o servidor: a conciliação salva fica no servidor, com a empresa e a competência; cada mudança sobe sozinha
 * e qualquer pessoa com acesso abre em outro computador e continua. Se duas pessoas mexerem ao mesmo tempo, quem
 * salvou depois recebe o aviso (nada é sobrescrito).
 */
const ESPERA_SALVAR = 2500;
const POR_PAGINA = 400;
const NOMES_COL = { data: "data", valor: "valor", doc: "documento", nome: "fornecedor/cliente", cpf: "CNPJ" };

function carregar() {
  const e = Store.get(CHAVE_AVULSA);
  return e ? Object.assign(avulsaVazia(), e, { manuais: e.manuais || [] }) : avulsaVazia();
}

/** Resultado da conciliação inteira (sem a busca da tela): é o resumo que vai para a lista do servidor. */
function resultadoInteiro(av) {
  if (!av.extrato || !av.rows || av.nfe || RegrasConc.ehBalancete(av.rows)) return null;
  const p = RegrasConc.lerPlanilhaTitulos(av.rows, av.tipo);
  return p.ok ? calcular({ Core, Conciliacao: RegrasConc, extrato: av.extrato, sistema: p.itens, grupos: av.manuais, tolerancia: av.tolerancia, filtro: "", avulso: true }) : null;
}

const horaCurta = (iso) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");

/** Empresa da conciliação: busca no Departamento Cadastro (só as da carteira de quem está usando). */
function EscolherEmpresa({ cnpj, nome, aoEscolher }) {
  const [svc, v] = useDepCadastro();
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);
  const achadas = useMemo(() => (aberto && texto.trim() ? svc.buscarEmpresas(texto).slice(0, 8) : []), [svc, v, texto, aberto]);   // eslint-disable-line
  if (cnpj) {
    return (
      <div className="flex items-center gap-2 h-10 min-w-0">
        <span className="truncate text-[13.5px]"><strong className="font-semibold">{nome || "Empresa"}</strong> <span className="text-muted tabular-nums">{formatarDocumento(cnpj)}</span></span>
        <button type="button" className="btn-fantasma btn-sm" onClick={() => { aoEscolher(null); setTexto(""); }}>Trocar</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input id="av-empresa" type="search" value={texto} placeholder="Nome ou CNPJ" autoComplete="off" className="h-10 w-full"
        onChange={(e) => { setTexto(e.target.value); setAberto(true); }} onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => { if (e.key === "Enter" && achadas[0]) { e.preventDefault(); aoEscolher(achadas[0]); setAberto(false); } }} />
      {achadas.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-[260px] overflow-auto rounded-lg border border-line bg-surface shadow-lg text-[13px]" role="listbox">
          {achadas.map((c) => (
            <li key={c.id}><button type="button" className="w-full text-left px-3 py-1.5 hover:bg-surface-2" onMouseDown={(e) => e.preventDefault()}
              onClick={() => { aoEscolher(c); setAberto(false); }}>
              <span className="block truncate">{c.nome}</span><span className="block text-[12px] text-muted tabular-nums">{formatarDocumento(c.documento)}</span></button></li>
          ))}
        </ul>
      )}
    </div>
  );
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
  // servidor: lista das conciliações salvas, a escolhida e a situação do salvamento automático
  const [lista, setLista] = useState({ itens: [], erro: "", carregou: false });
  const [escolhidaSrv, setEscolhidaSrv] = useState("");
  const [situacao, setSituacao] = useState({ tipo: "", texto: "" });   // salvando | salvo | conflito | erro
  const avRef = useRef(av);
  avRef.current = av;
  const enviando = useRef(false);

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

  const recarregarLista = () => {
    if (!SRV) return Promise.resolve();
    return listarConciliacoes().then((l) => setLista({ itens: (l || []).filter((c) => empresaVisivelPorCnpj(c.empresaCnpj)), erro: "", carregou: true }))
      .catch((e) => setLista((x) => Object.assign({}, x, { erro: e.message, carregou: true })));
  };
  useEffect(() => { recarregarLista(); }, []);   // eslint-disable-line

  // salvamento automático: a conciliação aberta do servidor sobe um instante depois de cada mudança
  const enviar = async () => {
    const a = avRef.current;
    if (!SRV || !a.servidor || enviando.current) return;
    enviando.current = true;
    setSituacao({ tipo: "salvando", texto: "Salvando…" });
    try {
      const dto = await salvarConciliacao(a.servidor.id, a.servidor.versao, pedidoParaServidor(a, resultadoInteiro(a), a.salvaNome));
      // a base é o que foi enviado: se mudou algo enquanto subia, sobe de novo na próxima volta
      setAv((atual) => (atual.servidor && atual.servidor.id === dto.id ? Object.assign({}, atual, { salvaNome: dto.nome, servidor: depoisDeSalvar(a, dto).servidor }) : atual));
      setSituacao({ tipo: "salvo", texto: "Salva no servidor às " + horaCurta(dto.atualizadoEm) + "." });
      setLista((l) => Object.assign({}, l, { itens: [dto].concat(l.itens.filter((x) => x.id !== dto.id)) }));
    } catch (e) {
      setSituacao(e.codigo === "conflito" ? { tipo: "conflito", texto: e.message }
        : e.status === 404 ? { tipo: "conflito", texto: e.message }
          : { tipo: "erro", texto: "Não consegui salvar no servidor: " + e.message });
    } finally {
      enviando.current = false;
    }
  };
  const pendenteNoServidor = SRV && mudouDesdeOServidor(av);
  useEffect(() => {
    if (!pendenteNoServidor || situacao.tipo === "conflito" || situacao.tipo === "erro") return undefined;
    const t = setTimeout(enviar, ESPERA_SALVAR);
    return () => clearTimeout(t);
  }, [av, pendenteNoServidor, situacao.tipo]);   // eslint-disable-line

  const escolherEmpresa = (c) => setAv((a) => Object.assign({}, a, c ? { empresaCnpj: String(c.documento || "").replace(/\D/g, ""), empresaNome: c.nome || "" } : { empresaCnpj: "", empresaNome: "" }));

  const lerExtratos = async (files) => {
    setMsg({ texto: "Lendo " + files.length + " arquivo(s)…", tipo: "info" });
    const j = juntarExtratos(await Promise.all(files.map(lerArquivoExtrato)));
    if (!j.itens.length) {
      setMsg({ texto: j.erros.length ? j.erros.map((l) => l.arquivo + ": " + l.erro).join(" ") : "Nenhuma movimentação reconhecida no arquivo.", tipo: "erro" });
      return;
    }
    setAv((a) => {
      const n = Object.assign({}, a, { extrato: j.itens, formato: j.formato, conferencia: j.conferencia, extratoNome: files.map((f) => f.name).join(", ") });
      if (!n.competencia) n.competencia = competenciaProvavel(n);
      return n;
    });
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

  // ---------------------------------------------------------- com o servidor
  const salvarNoServidor = (base) => {
    const av = base || avRef.current;
    if (!av.extrato || !av.rows) { aviso("Escolha o extrato e a planilha antes de salvar."); return; }
    if (av.servidor) { enviar(); return; }
    if (!resultadoInteiro(av)) { aviso("A planilha desta conciliação não abre aqui."); return; }
    setPedido({ titulo: "Salvar no servidor", botao: "Salvar", rotulo: "Nome", exemplo: "Comercial Exemplo – Outubro de 2026",
      inicial: av.empresaNome && av.competencia ? av.empresaNome + " – " + Importacao.nomeCompetencia(av.competencia) : nomeSugerido(av, Importacao.nomeCompetencia),
      texto: "A conciliação fica no servidor, com o extrato e a planilha já lidos e o que foi feito à mão. Depois disso, cada mudança é salva sozinha, e quem tem acesso à Conciliação abre em outro computador e continua."
        + (av.empresaCnpj ? "" : " Dica: escolha a empresa antes, para achar fácil na lista."),
      ok: async (nome) => {
        try {
          const n = nome || nomeSugerido(av, Importacao.nomeCompetencia);
          const dto = await criarConciliacao(pedidoParaServidor(av, resultadoInteiro(av), n));
          setAv(depoisDeSalvar(Object.assign({}, av, { salvaId: null }), dto));
          setPedido(null); setEscolhidaSrv(dto.id);
          setSituacao({ tipo: "salvo", texto: "Salva no servidor às " + horaCurta(dto.atualizadoEm) + "." });
          aviso("Conciliação salva no servidor: " + dto.nome + ".");
          recarregarLista();
        } catch (e) { aviso("Não consegui salvar no servidor: " + e.message); }
      } });
  };
  const abrirDoServidor = async (id) => {
    if (!id) return;
    if ((!av.servidor || av.servidor.id !== id) && ((av.servidor && mudouDesdeOServidor(av)) || (!av.servidor && av.manuais.length)) &&
      !(await confirmar({ titulo: "Abrir outra conciliação?", botao: "Abrir mesmo assim", texto: "A conciliação aberta tem itens feitos à mão que não foram salvos." }))) return;
    try {
      const dto = await abrirConciliacao(id);
      setAv(avulsaDoServidor(dto));
      limparSelecao(); setFiltro(""); setLimite(POR_PAGINA); setMsg({ texto: "" });
      setSituacao({ tipo: "salvo", texto: "Aberta do servidor (salva por " + (dto.atualizadoPorNome || dto.atualizadoPor || "—") + " às " + horaCurta(dto.atualizadoEm) + ")." });
      setEscolhidaSrv(id);
    } catch (e) { aviso("Não consegui abrir: " + e.message); recarregarLista(); }
  };
  const excluirDoServidor = async () => {
    const c = lista.itens.find((x) => x.id === escolhidaSrv);
    if (!c || !(await confirmar({ titulo: "Excluir a conciliação do servidor?", botao: "Excluir", texto: "\"" + c.nome + "\" sai da lista de todo mundo. Não dá para desfazer." }))) return;
    try {
      await excluirConciliacao(c.id);
      if (av.servidor && av.servidor.id === c.id) { setAv((a) => Object.assign({}, a, { servidor: null, salvaNome: "" })); setSituacao({ tipo: "", texto: "" }); }
      setEscolhidaSrv(""); recarregarLista();
      aviso("Conciliação excluída.");
    } catch (e) { aviso(e.message); }
  };
  // salvas antes, só neste navegador: sobem uma a uma e saem daqui
  const enviarLocais = async () => {
    let ok = 0;
    for (const s of salvas) {
      const e = Store.get(PREFIXO_SALVA + s.id);
      if (!e) continue;
      const a = Object.assign(avulsaVazia(), e, { manuais: e.manuais || [] });
      try {
        await criarConciliacao(pedidoParaServidor(Object.assign({}, a, { competencia: a.competencia || competenciaProvavel(a) }), resultadoInteiro(a), s.nome));
        Store.remove(PREFIXO_SALVA + s.id); ok++;
      } catch (err) { aviso("Parei em \"" + s.nome + "\": " + err.message); break; }
    }
    setSalvas(listarSalvas(Store)); recarregarLista();
    if (ok) aviso(ok + " conciliação(ões) enviada(s) para o servidor.");
  };

  // ---------------------------------------------------------- só neste navegador (sem servidor)
  const salvar = () => {
    if (SRV) { salvarNoServidor(); return; }
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
    if (naoSalvo &&
      !(await confirmar({ titulo: "Limpar a conciliação?", botao: "Limpar mesmo assim", texto: "Há itens conciliados à mão que não foram salvos. Se quiser guardar, cancele e use \"Salvar conciliação\"." }))) return;
    setAv(avulsaVazia(av.tolerancia)); limparSelecao(); setFiltro(""); setEscolhida(""); setEscolhidaSrv(""); setMsg({ texto: "" }); setSituacao({ tipo: "", texto: "" });
  };

  const receb = av.tipo === "recebimentos";
  const naoSalvo = SRV ? (av.servidor ? mudouDesdeOServidor(av) : av.manuais.length > 0) : trabalhoNaoSalvo(Store, av);
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
        {SRV && (
          <div className="grid sm:grid-cols-[minmax(0,1fr)_180px] gap-3 items-start">
            <Campo rotulo="Empresa" id="av-empresa" dica={av.empresaCnpj ? "" : "Para achar a conciliação na lista e saber de quem é"}>
              <EscolherEmpresa cnpj={av.empresaCnpj} nome={av.empresaNome} aoEscolher={escolherEmpresa} />
            </Campo>
            <Campo rotulo="Competência" id="av-comp" dica={av.extrato && av.competencia === competenciaProvavel(av) ? "Pelo extrato" : ""}>
              <input id="av-comp" type="month" value={av.competencia || ""} className="h-10 w-full"
                onChange={(e) => setAv((a) => Object.assign({}, a, { competencia: e.target.value }))} />
            </Campo>
          </div>
        )}
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
            {!SRV && av.salvaNome && <li>Conciliação: <strong className="text-ink-2">{av.salvaNome}</strong> {naoSalvo ? <span className="text-warn">(com alterações não salvas)</span> : "(salva)"}</li>}
            {SRV && av.servidor && <li>Conciliação: <strong className="text-ink-2">{av.salvaNome}</strong>{" "}
              {situacao.tipo === "salvando" ? <span>(salvando…)</span> : pendenteNoServidor ? <span>(alterações sobem em instantes)</span> : <span>(salva no servidor)</span>}</li>}
            {SRV && !av.servidor && av.extrato && av.rows && <li className="text-ink-2">Ainda não está no servidor: use <strong>Salvar no servidor</strong> para outra pessoa poder continuar.</li>}
            {av.extrato && <li>Extrato: {numero(av.extrato.length)} movimentação(ões) ({av.formato}){av.conferencia}.</li>}
            {titulos && <li>Planilha: {numero(titulos.length)} título(s). Colunas usadas: {Object.keys(plan.colunas).map((k) => NOMES_COL[k] + " = \"" + plan.colunas[k] + "\"").join(", ")}.</li>}
            {av.extrato && !av.rows && <li className="text-ink-2">Agora escolha a planilha.</li>}
            {!av.extrato && av.rows && <li className="text-ink-2">Agora escolha o extrato.</li>}
          </ul>
        )}
        {SRV && (
          <div className="pt-3 border-t border-line space-y-2">
            <div className="flex flex-wrap items-end gap-2">
              <Campo rotulo="Conciliações salvas no servidor" id="av-srv" className="flex-1 min-w-[240px] max-w-[640px]">
                <select id="av-srv" value={escolhidaSrv} onChange={(e) => setEscolhidaSrv(e.target.value)}>
                  <option value="">{lista.carregou ? (lista.itens.length ? "Escolha…" : "Nenhuma ainda") : "Carregando…"}</option>
                  {lista.itens.map((c) => <option key={c.id} value={c.id}>{rotuloDaConciliacao(c)}</option>)}
                </select>
              </Campo>
              <button type="button" className="btn-contorno h-10" disabled={!escolhidaSrv} onClick={() => abrirDoServidor(escolhidaSrv)}>Abrir</button>
              <button type="button" className="btn-fantasma h-10" disabled={!escolhidaSrv} onClick={excluirDoServidor}>Excluir</button>
              <button type="button" className="btn-fantasma h-10" onClick={recarregarLista} title="Busca de novo a lista (o que outras pessoas salvaram)">Atualizar</button>
            </div>
            {lista.erro && <p className="text-[12.5px] text-warn">Não consegui buscar a lista: {lista.erro}</p>}
            {salvas.length > 0 && (
              <p className="text-[12.5px] text-muted flex flex-wrap items-center gap-2">
                <span>{numero(salvas.length)} conciliação(ões) salva(s) antes só neste navegador.</span>
                <button type="button" className="btn-contorno btn-sm" onClick={enviarLocais}>Enviar para o servidor</button>
              </p>
            )}
          </div>
        )}
        {!SRV && salvas.length > 0 && (
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
      {SRV && (situacao.tipo === "conflito" || situacao.tipo === "erro") && (
        <div role="alert" className="cartao p-3 border-warn flex flex-wrap items-center gap-2 text-[13.5px]">
          <span className="flex-1 min-w-[240px] text-warn">{situacao.texto}{situacao.tipo === "conflito" ? " As suas últimas mudanças não foram para o servidor." : ""}</span>
          {situacao.tipo === "conflito" && av.servidor && <button type="button" className="btn-contorno btn-sm" onClick={async () => {
            if (await confirmar({ titulo: "Abrir a versão do servidor?", botao: "Abrir", texto: "O que você mudou depois do último salvamento fica de fora." })) abrirDoServidor(av.servidor.id);
          }}>Abrir a versão do servidor</button>}
          {situacao.tipo === "conflito" && <button type="button" className="btn-fantasma btn-sm" onClick={() => {
            const nova = Object.assign({}, av, { servidor: null, salvaNome: (av.salvaNome || "Conciliação") + " (minha versão)" });
            setAv(nova); setSituacao({ tipo: "", texto: "" }); salvarNoServidor(nova);
          }}>Salvar a minha como outra</button>}
          {situacao.tipo === "erro" && <button type="button" className="btn-contorno btn-sm" onClick={() => { setSituacao({ tipo: "", texto: "" }); enviar(); }}>Tentar de novo</button>}
        </div>
      )}

      {r && (<>
        <Resumo r={r} avulso notas={notas} />
        <div className="flex flex-wrap items-center gap-2">
          <input type="search" value={filtro} onChange={(e) => { setFiltro(e.target.value); setLimite(POR_PAGINA); }} placeholder="Buscar fornecedor, histórico, NF…" aria-label="Buscar na conciliação" className="max-w-[340px] h-9" />
          <div className="flex-1" />
          {SRV && situacao.tipo === "salvo" && !pendenteNoServidor && <span className="text-[12.5px] text-muted">{situacao.texto}</span>}
          <button type="button" className="btn-primario btn-sm" onClick={salvar}>{SRV ? (av.servidor ? "Salvar agora" : "Salvar no servidor") : av.salvaId ? "Salvar alterações" : "Salvar conciliação"}</button>
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
