import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Core, Importacao } from "../lib/legado.js";
import { CODIGO_DARF, LIMITE_MENSAL, calcular, prazoDarf, prazoReinf } from "../lib/lucros.mjs";
import { useLucros } from "../lib/useLucros.js";
import { useEmDia } from "../lib/useEmDia.js";
import { ehMesmaPessoa } from "../lib/emDia.mjs";
import { useAuth } from "../lib/auth.jsx";
import { carregarXlsx } from "../lib/leitores.js";
import { useAvisos } from "../componentes/Avisos.jsx";
import Janela from "../componentes/Janela.jsx";
import Icone from "../componentes/Icone.jsx";
import { Campo, Segmentado, Selo, dataBR, numero } from "../componentes/contabil/ui.jsx";

/*
 * Distribuição de lucros (registro por sócio, IRRF de 10%, saldo de ata) e REINF por competência.
 * Regras em src/lib/lucros.mjs; empresas e sócios vêm do cadastro do Departamento Cadastro.
 */
const R$ = (v) => "R$ " + Core.formatBR(v || 0);
const mesTexto = (m) => Importacao.nomeCompetencia(m).replace(" de ", "/");
const somarMes = (m, n) => { const [a, b] = m.split("-").map(Number); const d = new Date(a, b - 1 + n, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const lerValor = (t) => { const n = Core.parseValor(String(t || "").trim()); return isNaN(n) ? 0 : Math.abs(n); };

function SemEmpresas() {
  return (
    <div className="cartao p-10 text-center space-y-3">
      <strong className="block text-[15px]">Nenhuma empresa com sócios</strong>
      <span className="block text-[13.5px] text-muted">As empresas e os sócios vêm do cadastro. Cadastre os sócios em Departamento Cadastro › Empresas (Editar), ou importe a aba Empresas do sistema do Depto. Contábil.</span>
      <Link to="/departamento-cadastro/empresas" className="btn-contorno btn-sm">Abrir Empresas</Link>
    </div>
  );
}

/** Base, IRRF, líquido e os prazos, para o formulário e para a calculadora. */
function Resultado({ c, data, comp, retencao }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3 space-y-2">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[["Base de cálculo", c.base], ["IRRF (10%)", c.irrf], ["Líquido ao sócio", c.liquido]].map(([t, v], i) => (
          <div key={t}><div className="text-[11.5px] text-muted">{t}</div><div className={"text-[15px] font-semibold tabular-nums " + (i === 1 && v ? "text-debit" : "")}>{R$(v)}</div></div>
        ))}
      </div>
      {(data || comp) && (
        <div className="text-[12.5px] text-ink-2 border-t border-line pt-2 space-y-0.5">
          {retencao && data && <div>DARF {CODIGO_DARF}: até <strong>{dataBR(prazoDarf(data))}</strong> (dia 20 do mês seguinte ao pagamento)</div>}
          {comp && <div>REINF de {mesTexto(comp)}: até <strong>{dataBR(prazoReinf(comp))}</strong>{retencao ? "" : " (sem retenção, a declaração é trimestral)"}</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- registrar
/** Também usado no Encerramento contábil (inicial: { empresaId, data }). */
export function FormDistribuicao({ editando, aoFechar, inicial }) {
  const [svc] = useLucros();
  const { aviso } = useAvisos();
  const empresas = svc.empresas().filter((c) => c.socios.length || (editando && c.id === editando.empresaId));
  const [f, setF] = useState(() => editando
    ? { empresaId: editando.empresaId, socio: editando.socio, data: editando.data, valor: Core.formatBR(editando.liquido), modo: "liquido",
      retencao: editando.retencao, ata: editando.ata, compReinf: editando.compReinf, obs: editando.obs }
    : Object.assign({ empresaId: empresas.length === 1 ? empresas[0].id : "", socio: "", data: svc.hoje(), valor: "", modo: "liquido", retencao: false, ata: false, compReinf: "", obs: "" }, inicial || {}));
  const [tocouRet, setTocouRet] = useState(!!editando);
  const [erro, setErro] = useState("");
  const muda = (c, v) => setF((x) => Object.assign({}, x, { [c]: v }));
  const emp = empresas.find((c) => c.id === f.empresaId);
  const valor = lerValor(f.valor);
  const baseSemRet = valor;
  const baseComRet = calcular(valor, f.modo, true).base;
  const sug = f.empresaId && f.socio && valor ? svc.sugerirRetencao(f.empresaId, f.socio, f.data, f.ata ? 0 : (f.retencao ? baseComRet : baseSemRet), editando && editando.id) : null;
  // sem a pessoa ter mexido, a retenção acompanha a sugestão
  useEffect(() => { if (!tocouRet && sug && !f.ata) setF((x) => (x.retencao === sug.reter ? x : Object.assign({}, x, { retencao: sug.reter }))); }, [sug && sug.reter, tocouRet, f.ata]);   // eslint-disable-line
  const c = calcular(valor, f.modo, f.retencao && !f.ata);
  const ata = f.empresaId ? svc.saldoAta(f.empresaId) : null;
  const comp = f.compReinf || (f.data || "").slice(0, 7);
  const salvar = (ev) => {
    ev.preventDefault();
    try {
      svc.salvar(Object.assign({}, f, { valor, compReinf: comp }), editando && editando.id);
      aviso(editando ? "Distribuição atualizada." : "Distribuição registrada."); aoFechar();
    } catch (e) { setErro(e.message); }
  };
  return (
    <Janela aberta titulo={editando ? "Editar distribuição" : "Registrar distribuição"} aoFechar={aoFechar} largura="max-w-[640px]"
      rodape={<><button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button><button type="submit" form="form-dl" className="btn-primario">Salvar</button></>}>
      <form id="form-dl" onSubmit={salvar} className="grid sm:grid-cols-2 gap-3">
        <Campo rotulo="Empresa" id="dl-emp" className="sm:col-span-2">
          <select id="dl-emp" value={f.empresaId} onChange={(e) => { muda("empresaId", e.target.value); muda("socio", ""); }} data-foco>
            <option value="">Escolha…</option>{empresas.map((x) => <option key={x.id} value={x.id}>{x.nome}{x.filiais ? " (+" + x.filiais + " filial)" : ""}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Sócio" id="dl-socio">
          <input id="dl-socio" list="dl-socios" value={f.socio} onChange={(e) => muda("socio", e.target.value)} autoComplete="off" placeholder={emp ? "Escolha ou digite" : "Escolha a empresa"} />
          <datalist id="dl-socios">{(emp ? emp.socios : []).map((s) => <option key={s.nome} value={s.nome}>{s.percentual ? s.percentual + "%" : ""}</option>)}</datalist>
        </Campo>
        <Campo rotulo="Data do pagamento" id="dl-data"><input id="dl-data" type="date" value={f.data} onChange={(e) => muda("data", e.target.value)} /></Campo>
        <Campo rotulo="Valor" id="dl-valor"><input id="dl-valor" value={f.valor} onChange={(e) => muda("valor", e.target.value)} inputMode="decimal" placeholder="0,00" className="text-right tabular-nums" /></Campo>
        <div className="space-y-1.5"><span className="rotulo">O valor é</span>
          <Segmentado rotulo="O valor é" valor={f.modo} aoMudar={(v) => muda("modo", v)} opcoes={[["liquido", "Líquido ao sócio"], ["bruto", "Bruto (base)"]]} /></div>
        <div className="sm:col-span-2 space-y-1.5 text-[13.5px]">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.ata} onChange={(e) => { muda("ata", e.target.checked); if (e.target.checked) muda("retencao", false); }} />
            Lucro aprovado em ata (exercícios anteriores, sem IRRF){ata && ata.inicial > 0 && <span className="text-muted"> · saldo {R$(ata.saldo)}</span>}</label>
          {!f.ata && <label className="flex items-center gap-2"><input type="checkbox" checked={f.retencao} onChange={(e) => { setTocouRet(true); muda("retencao", e.target.checked); }} /> Com retenção de IRRF (10%)</label>}
          {sug && !f.ata && (
            <p className={"text-[12.5px] " + (sug.reter ? "text-warn" : "text-muted")}>
              {sug.antes ? "Já pago a " + f.socio + " neste mês: " + R$(sug.antes) + ". " : ""}Com este, o mês fica em {R$(sug.total)}: {sug.reter ? "passa de " + R$(LIMITE_MENSAL) + ", tem retenção." : "até " + R$(LIMITE_MENSAL) + ", sem retenção."}
              {sug.reter && sug.antes > 0 && " O IRRF é sobre o total do mês: confira também o que já foi pago."}
              {tocouRet && sug.reter !== f.retencao && <button type="button" className="ml-1 text-brand underline" onClick={() => { setTocouRet(false); muda("retencao", sug.reter); }}>usar a sugestão</button>}
            </p>
          )}
        </div>
        <Campo rotulo="Competência da REINF" id="dl-comp" dica="Normalmente o mês do pagamento."><input id="dl-comp" type="month" value={comp} onChange={(e) => muda("compReinf", e.target.value)} /></Campo>
        <Campo rotulo="Observação" id="dl-obs"><input id="dl-obs" value={f.obs} onChange={(e) => muda("obs", e.target.value)} autoComplete="off" /></Campo>
        <div className="sm:col-span-2"><Resultado c={c} data={f.data} comp={comp} retencao={f.retencao && !f.ata} /></div>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
      {erro && <p className="text-debit text-[13px]" role="alert">{erro}</p>}
    </Janela>
  );
}

function Calculadora() {
  const [valor, setValor] = useState("");
  const [modo, setModo] = useState("liquido");
  const c = calcular(lerValor(valor), modo, true);
  return (
    <section className="cartao p-4 space-y-3">
      <h2 className="text-[15px] font-semibold">Calculadora de IRRF</h2>
      <div className="flex flex-wrap items-end gap-2">
        <Campo rotulo="Valor" id="calc-valor"><input id="calc-valor" value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" className="text-right tabular-nums w-[160px]" /></Campo>
        <Segmentado pequeno rotulo="O valor é" valor={modo} aoMudar={setModo} opcoes={[["liquido", "Líquido"], ["bruto", "Bruto"]]} />
      </div>
      <Resultado c={c} />
      <p className="text-[12px] text-muted">Informando o líquido: base = líquido ÷ 90 × 100 e IRRF = 10% da base. Retenção quando o total pago ao mesmo sócio no mês passa de {R$(LIMITE_MENSAL)}.</p>
    </section>
  );
}

function JanelaAta({ aoFechar }) {
  const [svc, versao] = useLucros();
  const { aviso } = useAvisos();
  const lista = useMemo(() => svc.empresas().map((c) => Object.assign({ empresa: c }, svc.saldoAta(c.id))), [svc, versao]);   // eslint-disable-line
  return (
    <Janela aberta titulo="Saldo de lucros aprovados em ata" aoFechar={aoFechar} largura="max-w-[640px]"
      rodape={<button type="button" className="btn-fantasma" onClick={aoFechar}>Fechar</button>}>
      <p className="text-[13px] text-muted">Lucros de exercícios anteriores já aprovados em ata, que podem ser distribuídos sem IRRF. Informe o saldo aprovado de cada empresa; as distribuições marcadas como "aprovado em ata" vão abatendo.</p>
      <div className="overflow-x-auto relative">
        <table className="w-full text-[13.5px]">
          <thead className="text-left text-[12px] uppercase tracking-wide text-muted"><tr><th className="py-2 pr-2">Empresa</th><th className="py-2 px-2 text-right">Aprovado</th><th className="py-2 px-2 text-right">Distribuído</th><th className="py-2 pl-2 text-right">Saldo</th></tr></thead>
          <tbody className="divide-y divide-line">
            {lista.map((l) => (
              <tr key={l.empresa.id}>
                <td className="py-1.5 pr-2 font-medium">{l.empresa.nome}</td>
                <td className="py-1 px-1 text-right"><CampoValor valor={l.inicial} rotulo={"Saldo aprovado de " + l.empresa.nome} aoGravar={(v) => { try { svc.definirSaldoAta(l.empresa.id, v); } catch (e) { aviso(e.message); } }} /></td>
                <td className="py-1.5 px-2 text-right tabular-nums text-muted">{l.usado ? Core.formatBR(l.usado) : "—"}</td>
                <td className={"py-1.5 pl-2 text-right tabular-nums font-semibold " + (l.saldo < 0 ? "text-debit" : "")}>{l.inicial || l.usado ? Core.formatBR(l.saldo) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Janela>
  );
}
function CampoValor({ valor, aoGravar, rotulo }) {
  const fmt = (v) => (v ? Core.formatBR(v) : "");
  const [t, setT] = useState(fmt(valor));
  useEffect(() => { setT(fmt(valor)); }, [valor]);
  return <input value={t} onChange={(e) => setT(e.target.value)} onBlur={() => { const v = lerValor(t); if (v !== (valor || 0)) aoGravar(v); else setT(fmt(valor)); }}
    onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} aria-label={rotulo} inputMode="decimal" placeholder="0,00"
    className="h-8 w-[130px] px-2 text-right tabular-nums text-[13px] border-transparent bg-transparent hover:border-line focus:bg-surface" />;
}

// ---------------------------------------------------------------- distribuições
function Distribuicoes() {
  const [svc, versao] = useLucros();
  const { aviso } = useAvisos();
  const atual = new Date().getFullYear();
  const [ano, setAno] = useState(String(atual));
  const [empresaId, setEmpresaId] = useState("");
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState(null);
  const [ataAberta, setAtaAberta] = useState(false);
  const empresas = useMemo(() => svc.empresas(), [svc, versao]);   // eslint-disable-line
  const h = useMemo(() => svc.historico({ ano, empresaId, busca }), [svc, ano, empresaId, busca, versao]);   // eslint-disable-line
  const comSocios = empresas.filter((c) => c.socios.length);
  const excluir = (x) => { const d = svc.excluir(x.id); if (d) aviso("Distribuição excluída.", { desfazer: d }); };
  const baixar = async () => {
    try {
      const XLSX = await carregarXlsx();
      const linhas = [["Data", "Empresa", "Sócio", "Base", "IRRF", "Líquido", "Retenção", "Aprovado em ata", "Competência REINF", "Observação"]]
        .concat(h.lista.map((x) => [dataBR(x.data), x.empresa, x.socio, x.base, x.irrf, x.liquido, x.retencao ? "Sim" : "Não", x.ata ? "Sim" : "Não", mesTexto(x.compReinf), x.obs]));
      const socios = [["Empresa", "Sócio", "Base", "IRRF", "Líquido"]].concat(svc.porSocio(ano, empresaId).map((s) => [s.empresa, s.socio, s.base, s.irrf, s.liquido]));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), "Distribuições");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(socios), "Por sócio");
      XLSX.writeFile(wb, "distribuicao-lucros-" + ano + ".xlsx");
    } catch (e) { aviso("Não consegui gerar o Excel: " + (e.message || e)); }
  };
  const demo = () => aviso(svc.carregarDemonstracao() ? "Demonstração carregada: distribuições, saldo de ata e REINF fictícios." : "Precisa de empresas com sócios e de nenhuma distribuição registrada.");
  if (!comSocios.length && !h.lista.length) return <SemEmpresas />;
  const anos = [atual - 2, atual - 1, atual].map(String);
  const cartoes = [["Total distribuído", R$(h.totais.distribuido)], ["IRRF retido", R$(h.totais.irrf)], ["Distribuições", numero(h.totais.qtd)], ["Com retenção", numero(h.totais.comRetencao)]];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cartoes.map(([t, v]) => <div key={t} className="cartao px-4 py-3"><div className="text-[12.5px] text-muted">{t}</div><div className="text-[20px] font-semibold tabular-nums truncate">{v}</div></div>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmentado pequeno rotulo="Ano" valor={ano} aoMudar={setAno} opcoes={anos.map((a) => [a, a])} />
        <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} aria-label="Empresa" className="h-9 w-auto max-w-[260px]">
          <option value="">Todas as empresas</option>{empresas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa ou sócio…" aria-label="Buscar" className="max-w-[240px] h-9" />
        <div className="flex-1" />
        <button type="button" className="btn-contorno btn-sm" onClick={() => setAtaAberta(true)}>Saldo de ata</button>
        <button type="button" className="btn-contorno btn-sm" onClick={baixar} disabled={!h.lista.length}>Baixar Excel</button>
        <button type="button" className="btn-primario btn-sm" onClick={() => setForm({ editando: null })}><Icone nome="mais" />Registrar distribuição</button>
      </div>
      <div className="grid 2xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <div className="cartao overflow-hidden">
          {!h.lista.length ? (
            <div className="p-10 text-center space-y-3"><strong className="block text-[15px]">Nenhuma distribuição em {ano}</strong>
              <span className="block text-[13.5px] text-muted">Registre em Registrar distribuição, ou veja como fica com a demonstração.</span>
              <button type="button" className="btn-contorno btn-sm" onClick={demo}>Carregar demonstração</button></div>
          ) : (
            <div className="overflow-x-auto relative">
              <table className="w-full text-[13.5px]">
                <thead className="bg-surface-2 text-left text-[12px] uppercase tracking-wide text-muted">
                  <tr><th className="px-3 py-2.5 font-semibold">Data</th><th className="px-3 py-2.5 font-semibold min-w-[180px]">Empresa / sócio</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Base</th><th className="px-3 py-2.5 font-semibold text-right">IRRF</th><th className="px-3 py-2.5 font-semibold text-right">Líquido</th>
                    <th className="px-3 py-2.5 font-semibold">REINF</th><th className="px-2 py-2.5"><span className="sr-only">Ações</span></th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {h.lista.map((x) => (
                    <tr key={x.id} className="hover:bg-surface-2 align-top">
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{dataBR(x.data)}</td>
                      <td className="px-3 py-2"><strong className="block font-medium">{x.empresa}</strong><span className="text-[12.5px] text-muted">{x.socio}</span>
                        {x.ata && <span className="ml-1.5"><Selo tipo="sugerida">Ata</Selo></span>}{x.obs && <span className="block text-[12px] text-muted">{x.obs}</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{Core.formatBR(x.base)}</td>
                      <td className={"px-3 py-2 text-right tabular-nums whitespace-nowrap " + (x.irrf ? "text-debit" : "text-muted")}>{x.irrf ? Core.formatBR(x.irrf) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold">{Core.formatBR(x.liquido)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-[12.5px]">{mesTexto(x.compReinf)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-right">
                        <button type="button" className="btn-fantasma btn-sm" onClick={() => setForm({ editando: x })}>Editar</button>
                        <button type="button" className="btn-perigo btn-sm" onClick={() => excluir(x)}>Excluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="grid sm:grid-cols-2 2xl:grid-cols-1 gap-4 items-start">
          <Calculadora />
          <section className="cartao p-4 space-y-2 text-[13px]">
            <h2 className="text-[15px] font-semibold">Prazos</h2>
            <p><strong>DARF {CODIGO_DARF}</strong> (IRRF): dia 20 do mês seguinte ao pagamento.</p>
            <p><strong>REINF</strong> com retenção: mensal, dia 15 do mês seguinte. Sem retenção: trimestral.</p>
            <p className="text-muted">Fim de semana antecipa para o dia útil anterior. Veja a REINF do mês em <Link to="/reinf" className="text-brand underline">REINF</Link>.</p>
          </section>
        </div>
      </div>
      {form && <FormDistribuicao editando={form.editando} aoFechar={() => setForm(null)} />}
      {ataAberta && <JanelaAta aoFechar={() => setAtaAberta(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------- REINF
function Reinf() {
  const [svc, versao] = useLucros();
  const [emDia, versaoEmDia] = useEmDia();
  const { usuario } = useAuth();
  const { aviso } = useAvisos();
  const [comp, setComp] = useState(svc.mesPadrao());
  const [so, setSo] = useState("todas");
  const [busca, setBusca] = useState("");
  const r = useMemo(() => svc.reinf(comp), [svc, comp, versao]);   // eslint-disable-line
  const eu = usuario ? { nome: usuario.nome, email: usuario.email } : null;
  const linhas = useMemo(() => r.linhas.map((l) => Object.assign({ responsavel: emDia.responsavel("contabil", l.empresa.id, comp) }, l)), [r, emDia, comp, versaoEmDia]);   // eslint-disable-line
  const b = busca.trim().toLowerCase();
  const visiveis = linhas.filter((l) => (so === "todas" || (so === "minhas" ? ehMesmaPessoa(l.responsavel, eu) : !l.confirmado)) && (!b || l.empresa.nome.toLowerCase().indexOf(b) > -1));
  const minhas = eu ? linhas.filter((l) => ehMesmaPessoa(l.responsavel, eu)).length : 0;
  const baixar = async () => {
    try {
      const XLSX = await carregarXlsx();
      const dados = [["Empresa", "CNPJ", "Responsável", "Notas de serviço", "Distribuído (líquido)", "IRRF", "Situação"]]
        .concat(linhas.map((l) => [l.empresa.nome, l.empresa.documento || "", l.responsavel, l.notas === "" ? "" : l.notas, l.distribuido ? l.distribuido.liquido : 0, l.distribuido ? l.distribuido.irrf : 0, l.confirmado ? "Confirmada" : "Pendente"]));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dados), "REINF " + comp);
      XLSX.writeFile(wb, "reinf-" + comp + ".xlsx");
    } catch (e) { aviso("Não consegui gerar o Excel: " + (e.message || e)); }
  };
  if (!r.total && !svc.empresas().length) return <SemEmpresas />;
  const pct = r.total ? Math.round(r.confirmadas / r.total * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-line bg-surface">
          <button type="button" className="btn-fantasma h-9 w-9 p-0" onClick={() => setComp(somarMes(comp, -1))} aria-label="Competência anterior">‹</button>
          <span className="px-2 text-[14px] font-semibold min-w-[130px] text-center">{mesTexto(comp)}</span>
          <button type="button" className="btn-fantasma h-9 w-9 p-0" onClick={() => setComp(somarMes(comp, 1))} aria-label="Próxima competência">›</button>
        </div>
        <label className="inline-flex items-center gap-2 text-[13.5px]">Prazo
          <input type="date" value={r.prazo} onChange={(e) => { try { svc.definirPrazo(comp, e.target.value === r.prazoPadrao ? "" : e.target.value); } catch (er) { aviso(er.message); } }} className="h-9 w-[160px]" aria-label="Prazo da REINF" />
        </label>
        {r.prazo !== r.prazoPadrao && <button type="button" className="text-[12.5px] text-brand underline" onClick={() => svc.definirPrazo(comp, "")}>voltar ao dia 15</button>}
        <div className="flex-1" />
        <button type="button" className="btn-contorno btn-sm" onClick={baixar}>Baixar Excel</button>
      </div>
      <section className="cartao p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <strong className="text-[16px]">{r.confirmadas} de {r.total} confirmada(s)</strong>
          <span className="text-[13px] text-muted">REINF de {mesTexto(comp)} · prazo {dataBR(r.prazo)}</span>
          {r.pendentes > 0 && svc.hoje() > r.prazo && <span className="text-[13px] font-semibold text-debit">Prazo vencido: {r.pendentes} pendente(s)</span>}
        </div>
        <div className="h-2 rounded-full bg-warn-soft overflow-hidden"><div className="h-full bg-credit" style={{ width: pct + "%" }} /></div>
      </section>
      <div className="flex flex-wrap items-center gap-2">
        <Segmentado pequeno rotulo="Mostrar" valor={so} aoMudar={setSo} opcoes={[["todas", "Todas (" + r.total + ")"], ["pendentes", "Pendentes (" + r.pendentes + ")"]].concat(minhas ? [["minhas", "Minhas (" + minhas + ")"]] : [])} />
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa…" aria-label="Buscar empresa" className="max-w-[260px] h-9" />
      </div>
      <div className="cartao overflow-hidden">
        <div className="overflow-x-auto relative">
          <table className="w-full text-[13.5px]">
            <thead className="bg-surface-2 text-left text-[12px] uppercase tracking-wide text-muted">
              <tr><th className="px-3 py-2.5 font-semibold min-w-[220px]">Empresa</th><th className="px-3 py-2.5 font-semibold">Responsável</th>
                <th className="px-3 py-2.5 font-semibold text-center">Notas de serviço</th><th className="px-3 py-2.5 font-semibold text-right">Lucros distribuídos</th>
                <th className="px-3 py-2.5 font-semibold text-center">Situação</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {!visiveis.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted">Nenhuma empresa com esse filtro.</td></tr>}
              {visiveis.map((l) => (
                <tr key={l.empresa.id} className="hover:bg-surface-2">
                  <td className="px-3 py-2"><strong className="block font-medium">{l.empresa.nome}</strong>
                    <span className="text-[12px] text-muted">{l.empresa.documento || "sem CNPJ"}{l.empresa.filiais ? " · +" + l.empresa.filiais + " filial(is)" : ""}</span></td>
                  <td className="px-3 py-2 text-ink-2">{l.responsavel || <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-1.5 text-center"><Notas valor={l.notas} rotulo={"Notas de serviço de " + l.empresa.nome} aoGravar={(v) => { try { svc.definirNotas(comp, l.empresa.id, v); } catch (e) { aviso(e.message); } }} /></td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{l.distribuido ? <><span className="tabular-nums font-semibold">{Core.formatBR(l.distribuido.liquido)}</span>
                    {l.distribuido.irrf > 0 && <span className="block text-[12px] text-debit tabular-nums">IRRF {Core.formatBR(l.distribuido.irrf)}</span>}</> : <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-1.5 text-center">
                    <button type="button" onClick={() => svc.confirmar(comp, l.empresa.id, !l.confirmado)} aria-pressed={l.confirmado}
                      className={"min-w-[110px] h-8 px-3 rounded-full border text-[12.5px] font-semibold " + (l.confirmado ? "bg-ok-soft text-credit border-credit/30" : "bg-warn-soft text-warn border-warn/30")}>{l.confirmado ? "✓ Confirmada" : "Pendente"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[12.5px] text-muted">As empresas são as matrizes que eram clientes na competência (a filial vai junto com a matriz). O responsável é o do setor Contábil no Em Dia. Os lucros vêm das distribuições com esta competência da REINF.</p>
    </div>
  );
}
function Notas({ valor, aoGravar, rotulo }) {
  const [t, setT] = useState(String(valor));
  useEffect(() => { setT(String(valor)); }, [valor]);
  return <input value={t} onChange={(e) => setT(e.target.value.replace(/\D/g, ""))} onBlur={() => { if (t !== String(valor)) aoGravar(t); }} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
    aria-label={rotulo} inputMode="numeric" placeholder="—" className="h-8 w-[80px] px-2 text-center tabular-nums text-[13px]" />;
}

export default function Lucros({ secao }) {
  return secao === "reinf" ? <Reinf /> : <Distribuicoes />;
}
