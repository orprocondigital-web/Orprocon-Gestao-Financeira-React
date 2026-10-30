/*
 * Departamento Cadastro: certidões, alvarás (com vencimento), faturamentos e demonstrativos contábeis
 * por empresa. Substitui o Painel de vencimentos.
 *
 * As empresas, as certidões e os alvarás continuam na chave do antigo painel ("painelVencimentos:v1",
 * mesmo formato), então nada do que já foi cadastrado se perde e o Início continua lendo os vencimentos.
 * Faturamentos e demonstrativos ficam em "depCadastro:v1". Sem tela; testado em tests/depCadastro.test.js.
 */

export const CHAVE_DOCS = "painelVencimentos:v1";
export const CHAVE = "depCadastro:v1";

export const TIPOS_CERTIDOES = ["CND Federal", "CND Estadual", "CND Municipal", "CRF FGTS", "CND Trabalhista", "Certificado Digital", "Procuração", "Licença"];
export const CERTIFICADO = "Certificado Digital";
export const MODELOS_CERTIFICADO = ["A1", "A3"];
export const TIPOS_ALVARAS = ["Alvará municipal", "Alvará sanitário", "Alvará dos Bombeiros", "Alvará ambiental"];
/** Os três alvarás que toda empresa tem na grade (cada um pode ser "não se aplica"). */
export const ALVARAS_GRADE = ["Alvará municipal", "Alvará sanitário", "Alvará dos Bombeiros"];
export const NOME_CURTO_ALVARA = { "Alvará municipal": "Municipal", "Alvará sanitário": "Sanitário", "Alvará dos Bombeiros": "Bombeiros", "Alvará ambiental": "Ambiental" };
/** Situação do alvará além da data (campo sitAlvara do documento). "" = vale a data de vencimento. */
export const SITUACOES_ALVARA = [
  { id: "", nome: "Pela data de vencimento" },
  { id: "solicitado", nome: "Solicitado / em andamento" },
  { id: "guia_enviada", nome: "Guia ou taxa enviada" },
  { id: "renovado", nome: "Renovado (falta a nova data)" },
  { id: "permanente", nome: "Permanente (sem vencimento)" },
  { id: "vencido", nome: "Vencido" },
  { id: "debitos", nome: "Débitos / taxa atrasada" },
  { id: "nao_possui", nome: "Não possui" },
  { id: "dispensado", nome: "Dispensado" },
  { id: "isento", nome: "Isento" },
  { id: "baixada", nome: "Baixada" }
];
const NAO_SE_APLICA = ["dispensado", "isento", "baixada"];
export const DEMONSTRATIVOS = ["Balanço Patrimonial", "DRE", "Balancete"];
export const STATUS_DEMO = [
  { id: "", nome: "Pendente" }, { id: "emitido", nome: "Emitido" }, { id: "entregue", nome: "Entregue" }, { id: "nao_se_aplica", nome: "Não se aplica" }
];
export const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export const REGIMES = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI", "Imune", "Isenta", "Pessoa física", "Outro"];
/** Lucro Real: apuração trimestral ou anual (muda quais obrigações valem). */
export const TIPOS_LUCRO_REAL = ["Trimestral", "Anual"];

const txt = (v) => (v === null || v === undefined ? "" : String(v).trim());
const iso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const semAcentoMin = (v) => txt(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function chaveNome(s) { return txt(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " "); }

/** Regime pelo texto de outra planilha ("SN", "Presumido", "L. Real"…); vazio quando não reconhece. */
export function regimePeloTexto(t) {
  const s = chaveNome(t).replace(/[.]/g, "");
  if (!s) return "";
  const certo = REGIMES.find((r) => chaveNome(r) === s);
  if (certo) return certo;
  if (/^mei\b|microempreendedor/.test(s)) return "MEI";
  if (/simples|^sn$/.test(s)) return "Simples Nacional";
  if (/presumid|^lp$/.test(s)) return "Lucro Presumido";
  if (/real|^lr$/.test(s)) return "Lucro Real";
  if (/^im$|imune/.test(s)) return "Imune";
  if (/^is$|isent/.test(s)) return "Isenta";
  if (/fisica|^pf$|^cpf$/.test(s)) return "Pessoa física";
  return "";
}

/** CNPJ: os 8 primeiros dígitos são a raiz; 0001 depois da raiz é a matriz, o resto são filiais. CPF não tem filial. */
export function raizCnpj(doc) { const d = txt(doc).replace(/\D/g, ""); return d.length === 14 ? d.slice(0, 8) : ""; }
export function ehFilial(doc) { const d = txt(doc).replace(/\D/g, ""); return d.length === 14 && d.slice(8, 12) !== "0001"; }

/** A empresa é cliente na competência (AAAA-MM)? inicio e saida são AAAA-MM; baixa (empresa encerrada) é AAAA-MM-DD. */
export function ativaNoMes(c, mes) {
  return !!c && (!c.inicio || c.inicio <= mes) && (!c.saida || c.saida >= mes) && (!c.baixa || c.baixa.slice(0, 7) >= mes);
}

/** "fulano.de.tal@empresa.com" → "Fulano De Tal" (o sistema antigo guardava o e-mail do responsável). */
export function nomeDoEmail(v) {
  const t = txt(v);
  if (t.indexOf("@") < 0) return t;
  return t.split("@")[0].split(/[._-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

/** Sócios: nome, CPF, % e datas (AAAA-MM-DD). Linhas sem nome saem; a soma não pode passar de 100%. */
export function limparSocios(lista) {
  const out = (Array.isArray(lista) ? lista : []).map((x) => ({
    nome: txt(x && x.nome), cpf: txt(x && x.cpf),
    percentual: Math.round((parseFloat(String((x && x.percentual) ?? "").replace(",", ".")) || 0) * 100) / 100,
    entrada: iso(x && x.entrada) ? x.entrada : "", saida: iso(x && x.saida) ? x.saida : ""
  })).filter((x) => x.nome);
  out.forEach((x) => { if (x.percentual < 0 || x.percentual > 100) throw new Error("Participação de " + x.nome + " fora de 0 a 100%."); });
  const soma = out.reduce((t, x) => t + x.percentual, 0);
  if (soma > 100.01) throw new Error("A soma das participações dá " + soma.toLocaleString("pt-BR") + "% (passa de 100%).");
  return out;
}

/** Certidões ou alvarás, pelo tipo do documento. */
export function grupoDoTipo(tipo) { return /^alvar/i.test(txt(tipo)) ? "alvaras" : "certidoes"; }

/** Certificado digital (e-CNPJ/e-CPF)? O CRF do FGTS também se chama "certificado", mas não é. */
export function ehCertificado(tipo) {
  const t = semAcentoMin(tipo);
  if (/regularidade|fgts/.test(t)) return false;
  return /^certificado\b|e-?cnpj|e-?cpf|icp-?brasil/.test(t);
}
/** A1 ou A3 pelo texto ("token", "cartão" e "A3" são A3; "arquivo" e "A1" são A1). */
export function modeloPeloTexto(texto) {
  const t = semAcentoMin(texto);
  if (/\ba3\b|token|cartao|leitora/.test(t)) return "A3";
  if (/\ba1\b|arquivo|\.pfx\b/.test(t)) return "A1";
  return "";
}
/**
 * Tipo como o sistema guarda: "Certificado A1", "Certificado A3", "e-CNPJ A3"… viram "Certificado Digital"
 * com o modelo (A1/A3) à parte. O modelo informado vale mais que o que está escrito no tipo.
 */
export function normalizarTipo(tipo, modelo) {
  const t = txt(tipo);
  if (/^alvar|^licenca de funcionamento/.test(semAcentoMin(t))) return { tipo: tipoDeAlvara(t), modelo: "" };
  if (!ehCertificado(t)) return { tipo: t, modelo: "" };
  const m = txt(modelo).toUpperCase();
  return { tipo: CERTIFICADO, modelo: MODELOS_CERTIFICADO.includes(m) ? m : modeloPeloTexto(t) };
}
/** "Alvará", "Alvará de funcionamento", "alvara bombeiro"… → um dos TIPOS_ALVARAS (o de funcionamento é o municipal). */
export function tipoDeAlvara(t) {
  const n = semAcentoMin(t);
  if (/sanitari|vigilancia/.test(n)) return "Alvará sanitário";
  if (/bombeir/.test(n)) return "Alvará dos Bombeiros";
  if (/ambienta/.test(n)) return "Alvará ambiental";
  return "Alvará municipal";
}

/**
 * Situação de um alvará: { status, dias, texto, cor }.
 * status (para contagens e avisos): vencido, 7, 30, ok, sem, na (não se aplica), andamento.
 * cor (para a grade): verde, amarelo, vermelho, cinza, branco.
 */
export function situacaoAlvara(d, hoje) {
  if (!d) return { status: "sem", dias: null, texto: "Falta informar", cor: "branco" };
  const sit = txt(d.sitAlvara);
  const nome = (SITUACOES_ALVARA.find((x) => x.id === sit) || {}).nome || "";
  const pelaData = iso(d.vencimento) ? situacao(d.vencimento, hoje) : null;
  if (NAO_SE_APLICA.includes(sit)) return { status: "na", dias: null, texto: nome, cor: "cinza" };
  if (sit === "permanente") return { status: "ok", dias: null, texto: "Permanente", cor: "verde" };
  if (sit === "vencido" || sit === "debitos") return { status: "vencido", dias: pelaData && pelaData.dias < 0 ? pelaData.dias : null, texto: sit === "debitos" ? "Débitos / taxa atrasada" : "Vencido", cor: "vermelho" };
  if (sit === "nao_possui") return { status: "andamento", dias: null, texto: "Não possui", cor: "amarelo" };
  if ((sit === "solicitado" || sit === "guia_enviada") && !(pelaData && pelaData.status === "ok")) return { status: "andamento", dias: pelaData ? pelaData.dias : null, texto: sit === "solicitado" ? "Solicitado" : "Guia enviada", cor: "amarelo" };
  if (pelaData) {
    const cor = pelaData.status === "vencido" ? "vermelho" : pelaData.status === "ok" ? "verde" : "amarelo";
    return Object.assign({}, pelaData, { texto: textoSituacao(pelaData), cor });
  }
  if (sit === "renovado") return { status: "andamento", dias: null, texto: "Renovado, falta a data", cor: "amarelo" };
  return { status: "sem", dias: null, texto: "Falta informar", cor: "branco" };
}

/**
 * Célula de alvará de uma planilha ("31/12/2026", data do Excel, "VENCIDO", "DISPENSADO - RET", "Precisa do Habita-se"…)
 * → { vencimento, situacao, observacao }, ou null se vazia. toIsoDate: Core.toIsoDate.
 */
export function lerCelulaAlvara(v, toIsoDate) {
  if (v === null || v === undefined || txt(v) === "") return null;
  if (v instanceof Date || typeof v === "number") { const d = toIsoDate(v); return d ? { vencimento: d, situacao: "", observacao: "" } : { vencimento: "", situacao: "", observacao: txt(v) }; }
  const original = txt(v);
  let vencimento = "";
  const m = /(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/.exec(original);
  if (m) vencimento = toIsoDate(m[1] + "/" + m[2] + "/" + (m[3].length === 2 ? "20" + m[3] : m[3])) || "";
  const resto = semAcentoMin(m ? original.replace(new RegExp(m[0].replace(/[.]/g, "\\."), "g"), " ") : original).replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  let situacao = "";
  if (/dispensad/.test(resto)) situacao = "dispensado";
  else if (/isent/.test(resto)) situacao = "isento";
  else if (/baixad/.test(resto)) situacao = "baixada";
  else if (/nao possui|n possui/.test(resto)) situacao = "nao_possui";
  else if (/debito|atrasad/.test(resto)) situacao = "debitos";
  else if (/vencid/.test(resto)) situacao = "vencido";
  else if (/permanente/.test(resto)) situacao = "permanente";
  else if (/guia enviada|taxa enviada|guias enviadas/.test(resto)) situacao = "guia_enviada";
  else if (/solicit|encaminhad|enchaminhad|aguardando/.test(resto)) situacao = "solicitado";
  else if (/renovad|^feito/.test(resto)) situacao = "renovado";
  // a anotação fica quando é mais que só a data ou a palavra da situação
  const soPalavra = /^(vencido|renovado|dispensado|solicitado|isento|isenta|baixada|nao possui|guia enviada|permanente|feito)$/.test(resto);
  const observacao = !resto || soPalavra ? "" : original;
  return { vencimento, situacao: situacao === "renovado" && vencimento ? "" : situacao, observacao };
}

/** "Certificado Digital · A3" (ou só o tipo, nos outros documentos). */
export function nomeDoTipo(d) { return d.modelo ? d.tipo + " · " + d.modelo : d.tipo; }

/** Dias até vencer e a situação: vencido, 7 (até 7 dias), 30 (até 30 dias) ou ok. */
export function situacao(vencimento, hoje) {
  if (!iso(vencimento)) return { dias: null, status: "sem" };
  const dias = Math.round((Date.parse(vencimento + "T00:00:00Z") - Date.parse(hoje + "T00:00:00Z")) / 86400000);
  return { dias, status: dias < 0 ? "vencido" : dias <= 7 ? "7" : dias <= 30 ? "30" : "ok" };
}
/**
 * Mensagem para o cliente sobre a renovação (e-mail ou WhatsApp), conforme o documento e a situação.
 * Devolve { assunto, texto, email, whatsapp }: email/whatsapp são links prontos (mailto: / https://wa.me/).
 */
export function mensagemRenovacao(d, assinatura) {
  const br = (x) => (iso(x) ? x.slice(8, 10) + "/" + x.slice(5, 7) + "/" + x.slice(0, 4) : "");
  const contato = (d.contato && d.contato.nome) || "";
  const s = d.situacao || { dias: null };
  const cert = d.tipo === CERTIFICADO;
  const doc = cert ? "o certificado digital" + (d.modelo ? " " + d.modelo : "") : (/^alvar/i.test(d.tipo) ? "o " : "a ") + d.tipo;
  const quando = s.dias === null ? "está sem data de vencimento cadastrada" : s.dias < 0 ? "venceu em " + br(d.vencimento) : s.dias === 0 ? "vence hoje (" + br(d.vencimento) + ")" : "vence em " + br(d.vencimento);
  const linhas = ["Olá" + (contato ? ", " + contato : "") + "!", "",
    "Informamos que " + doc + " da " + d.empresa + (d.cnpj ? " (CNPJ " + d.cnpj + ")" : "") + " " + quando + "."];
  if (cert) {
    linhas.push("", "Para renovar, precisamos agendar a validação com a certificadora (por videoconferência ou presencial) com o responsável legal da empresa.",
      d.modelo === "A3" ? "Após a validação, o novo certificado é gravado no token ou cartão." : "Após a validação, instalamos o novo certificado nos sistemas.",
      "", "Pode nos informar o melhor dia e horário para a validação?");
  } else {
    linhas.push("", s.dias !== null && s.dias < 0 ? "Já estamos providenciando a emissão de uma nova via. Se houver alguma pendência para a emissão, entraremos em contato." : "Já estamos acompanhando a renovação. Se houver alguma pendência para a emissão, entraremos em contato.");
  }
  linhas.push("", "Qualquer dúvida, estamos à disposição.", "", txt(assinatura) || "Equipe Orprocon");
  const assunto = d.empresa + " - " + (cert ? "renovação do certificado digital" : "renovação: " + d.tipo);
  const texto = linhas.join("\n");
  const email = (d.contato && d.contato.email) || "";
  let fone = String((d.contato && d.contato.telefone) || "").replace(/\D/g, "");
  if (fone.length === 10 || fone.length === 11) fone = "55" + fone;
  return {
    assunto, texto,
    email: "mailto:" + encodeURIComponent(email) + "?subject=" + encodeURIComponent(assunto) + "&body=" + encodeURIComponent(texto),
    whatsapp: "https://wa.me/" + (fone.length >= 12 ? fone : "") + "?text=" + encodeURIComponent(texto),
    temEmail: !!email, temTelefone: fone.length >= 12
  };
}

/** Linhas do Excel do painel de certificados (a 1ª é o cabeçalho). Datas em dd/mm/aaaa. */
export function linhasCertificados(lista) {
  const br = (d) => (iso(d) ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : "");
  return [["Empresa", "CNPJ/CPF", "Modelo", "Número", "Emissão", "Vencimento", "Situação", "Responsável", "Observações"]]
    .concat(lista.map((d) => [d.empresa, d.cnpj || "", d.modelo || "", d.numero || "", br(d.emissao), br(d.vencimento), textoSituacao(d.situacao), d.responsavel || "", d.observacoes || ""]));
}
export function textoSituacao(s) {
  if (s.texto) return s.texto;
  if (s.dias === null) return "Sem data";
  if (s.dias < 0) return "Venceu há " + -s.dias + (s.dias === -1 ? " dia" : " dias");
  if (s.dias === 0) return "Vence hoje";
  return "Vence em " + s.dias + (s.dias === 1 ? " dia" : " dias");
}


// ---------------------------------------------------------------- leitura de PDF de certidão / alvará

const DATA = /(\d{2})\/(\d{2})\/(\d{4})/;
const isoDe = (m) => m[3] + "-" + m[2] + "-" + m[1];
function todasDatas(t) { const out = []; const re = /(\d{2})\/(\d{2})\/(\d{4})/g; let m; while ((m = re.exec(t))) out.push({ iso: isoDe(m), pos: m.index }); return out; }
const semAcento = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Tipo do documento pelo texto (as certidões de cada órgão têm frases próprias). */
export function tipoPeloTexto(texto) {
  const t = semAcento(texto).toLowerCase();
  if (/certificado de regularidade do fgts|\bfgts\b/.test(t)) return "CRF FGTS";
  if (/debitos trabalhistas|justica do trabalho/.test(t)) return "CND Trabalhista";
  if (/tributos federais|divida ativa da uniao|receita federal/.test(t)) return "CND Federal";
  if (/alvara/.test(t)) return tipoDeAlvara(t);
  if (/procuracao/.test(t)) return "Procuração";
  if (/certificado digital|e-cnpj|e-cpf|icp-brasil/.test(t)) return CERTIFICADO;
  if (/secretaria de estado da fazenda|fazenda estadual|estado de|estadual/.test(t)) return "CND Estadual";
  if (/prefeitura|municipio|municipal/.test(t)) return "CND Municipal";
  if (/licenca/.test(t)) return "Licença";
  return "";
}

/**
 * Texto de um PDF de certidão ou alvará → { tipo, documento (CNPJ/CPF), emissao, vencimento, numero }.
 * O que não achar fica vazio; a pessoa confere antes de salvar.
 */
export function lerCertidao(texto) {
  const t = String(texto || "").replace(/\s+/g, " ");
  const s = semAcento(t).toLowerCase();
  const doc = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/.exec(t) || /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.exec(t);
  let vencimento = "";
  const fim = /(valid[ao] ate|validade|vencimento|vence em|data de validade)[^0-9]{0,40}(\d{2}\/\d{2}\/\d{4})(\s*(a|ate)\s*(\d{2}\/\d{2}\/\d{4}))?/.exec(s);
  if (fim) vencimento = isoDe(DATA.exec(fim[5] || fim[2]));
  let emissao = "";
  const ini = /(emitid[ao]|expedicao|data de emissao|emissao|expedid[ao])[^/]{0,40}?(\d{2}\/\d{2}\/\d{4})/.exec(s);
  if (ini) emissao = isoDe(DATA.exec(ini[2]));
  if (!vencimento) {   // sem a palavra "validade": a data mais à frente que não é a emissão
    const ds = todasDatas(t).map((d) => d.iso).filter((d) => d !== emissao).sort();
    if (ds.length && (!emissao || ds[ds.length - 1] > emissao)) vencimento = ds[ds.length - 1];
  }
  const num = /(certidao n(?:[ºo°]|\.|umero)|numero da certidao|codigo de controle(?: da certidao)?|certificacao numero|n[ºo°] da certidao|alvara n(?:[ºo°]|\.|umero))\s*:?\s*([a-z0-9][a-z0-9.\-\/]{3,})/.exec(s);
  let numero = "";
  if (num) { const i = s.indexOf(num[2], num.index); numero = t.substr(i, num[2].length).toUpperCase(); }
  // nome da empresa, para cadastrar quando o CNPJ ainda não existe no sistema
  const nm = /(?:nome empresarial|razao social|nome)\s*:\s*/.exec(s);
  let nome = "";
  if (nm) nome = t.substr(nm.index + nm[0].length, 120).split(/\s+(?:CNPJ|CPF|Inscri|Endere|Ressalvad|\(|-\s)/i)[0].replace(/[.,;]+$/, "").trim();
  const tipo = tipoPeloTexto(t);
  return { tipo, modelo: tipo === CERTIFICADO ? modeloPeloTexto(t) : "", documento: doc ? doc[0] : "", nome, emissao, vencimento, numero };
}

// ---------------------------------------------------------------- leitura de planilha (Excel)

const CAB = {
  empresa: ["empresa", "cliente", "razao social", "nome", "nome da empresa", "razao empresa", "razao"],
  documento: ["cnpj", "cpf", "cnpj/cpf", "cpf/cnpj", "documento da empresa", "cnpj / cpf / caepf", "cnpj/cpf/caepf", "cnpj / cpf", "cpf / cnpj"],
  tipo: ["tipo", "documento", "tipo de documento", "certidao", "alvara"],
  numero: ["numero", "n", "no", "nº", "numero do documento"],
  emissao: ["emissao", "data de emissao", "emitido em"],
  vencimento: ["vencimento", "validade", "data de vencimento", "vence em", "valido ate"],
  responsavel: ["responsavel"],
  modelo: ["modelo", "modelo do certificado", "a1/a3", "tipo do certificado"],
  regime: ["regime", "regime tributario", "tributacao", "enquadramento"],
  codigo: ["cod", "codigo", "cod empresa", "codigo da empresa", "id empresa"],
  // cadastro de empresas do Acessórias (modelo de importação / exportação)
  fantasia: ["nome fantasia", "fantasia"],
  apelido: ["apelido e-continuo", "apelido"],
  email: ["e-mail contato", "email contato", "e-mail", "email", "e-mail do contato"],
  telefone: ["fone contato", "telefone contato", "telefone", "fone", "celular", "whatsapp"],
  ie: ["ie", "inscricao estadual", "insc estadual"],
  ieUf: ["ie uf", "uf ie", "uf da ie"],
  // colunas do cadastro do sistema antigo do Depto. Contábil (as de senha são ignoradas de propósito)
  segmento: ["segmento", "ramo", "atividade"],
  contato: ["contato", "nome contato", "nome do contato"],
  obs: ["obs", "observacao", "observacoes"],
  socios: ["socios_json", "socios"],
  tipoLucroReal: ["tipolucroreal", "tipo lucro real", "tipo do lucro real"],
  entrada: ["entrada", "cliente desde"],
  saida: ["saida", "saiu em"],
  baixa: ["databaixa", "data de baixa", "data da baixa", "baixa"],
  respContabil: ["deptocontabil", "responsavel contabil", "contabil"],
  respFiscal: ["deptofiscal", "responsavel fiscal", "fiscal"],
  respDp: ["deptopessoal", "responsavel pessoal", "responsavel dp", "dp", "departamento pessoal"],
  respHist: ["responsavelhist"],
  cidade: ["cidade", "municipio"],
  uf: ["uf", "estado"],
  envioTaxas: ["enviada taxas", "envio taxas", "envio das taxas", "taxas enviadas", "taxas"],
  // planilha de renovação de alvarás: uma coluna por alvará, com a data ou a situação
  alvMunicipal: ["municipal", "alvara municipal", "alvara de funcionamento", "funcionamento"],
  alvSanitario: ["sanitario", "alvara sanitario", "vigilancia sanitaria"],
  alvBombeiro: ["bombeiro", "bombeiros", "alvara bombeiro", "alvara dos bombeiros", "corpo de bombeiros"]
};
/** Departamentos do Acessórias: coluna com S marca que a empresa é atendida por ele. */
export const DEPTOS_ACESSORIAS = { "alvaras": "Alvarás", "cadastros": "Cadastros", "certificado digital": "Certificado Digital", "departamento contabil": "Contábil",
  "departamento fiscal": "Fiscal", "departamento pessoal": "Pessoal", "financeiro": "Financeiro", "iss servico municipal": "ISS", "recepcao": "Recepção",
  "retencoes": "Retenções", "societario": "Societário" };
/** Cabeçalho do Acessórias (modelo de importação): usado na exportação, para o arquivo voltar a entrar no Acessórias ou na Central. */
export const CAB_ACESSORIAS = ["ID Empresa", "CNPJ / CPF / CAEPF", "Razão Empresa", "Nome Fantasia", "Apelido e-Contínuo", "Nome Contato", "E-mail Contato", "Fone Contato", "I.E.", "I.E. UF",
  "Alvarás", "Cadastros", "Certificado Digital", "Departamento Contábil", "Departamento Fiscal", "Departamento Pessoal", "Financeiro", "ISS Serviço Municipal", "Recepção", "Retenções", "Societário"];
/** Colunas da Central depois das do Acessórias (o Acessórias ignora as que não conhece). */
export const CAB_CENTRAL = ["Regime", "Segmento", "Cidade", "UF", "Cliente desde", "Saiu em", "Observações"];
const mesBR = (m) => (/^\d{4}-\d{2}$/.test(txt(m)) ? m.slice(5) + "/" + m.slice(0, 4) : "");
/**
 * Empresas → linhas da planilha (cabeçalho + uma linha por empresa; contatos e IEs a mais em linhas repetindo a empresa,
 * como o Acessórias pede). Importar o arquivo de volta não duplica nada.
 */
export function planilhaEmpresas(clientes) {
  const linhas = [CAB_ACESSORIAS.concat(CAB_CENTRAL)];
  const deptos = CAB_ACESSORIAS.slice(10).map((c) => DEPTOS_ACESSORIAS[normCab(c)]);
  (clientes || []).forEach((c) => {
    const contatos = c.contatos && c.contatos.length ? c.contatos : [{ nome: txt(c.contato), email: txt(c.email), telefone: txt(c.telefone) }];
    const ies = c.ies && c.ies.length ? c.ies : [{ ie: txt(c.ie), uf: txt(c.ieUf) }];
    const marcados = c.departamentos || [];
    for (let i = 0; i < Math.max(contatos.length, ies.length); i++) {
      const ct = contatos[i] || {}, ie = ies[i] || {};
      linhas.push([txt(c.codigo), txt(c.documento), txt(c.nome), txt(c.fantasia), txt(c.apelido), txt(ct.nome), txt(ct.email), txt(ct.telefone), txt(ie.ie), txt(ie.uf)]
        .concat(deptos.map((d) => (marcados.indexOf(d) > -1 ? "S" : "N")))
        .concat([txt(c.regime), txt(c.segmento), txt(c.cidade), txt(c.uf), mesBR(c.inicio), mesBR(c.saida), txt(c.obs)]));
    }
  });
  return linhas;
}
/** CNPJ/CPF/CAEPF tem 11 ou 14 dígitos. */
export function documentoValido(doc) { const n = txt(doc).replace(/\D/g, "").length; return n === 11 || n === 14; }
const simNao = (v) => /^(s|n|sim|nao|não|x)?$/i.test(txt(v));
const COL_ALVARA = { alvMunicipal: "Alvará municipal", alvSanitario: "Alvará sanitário", alvBombeiro: "Alvará dos Bombeiros" };
/** Chave da empresa na importação: o CNPJ/CPF quando tem (filiais com o mesmo nome ficam separadas), senão o nome. */
export function chaveEmpresa(nome, documento) {
  const d = txt(documento).replace(/\D/g, "");
  return d.length >= 11 ? "d:" + d : "n:" + chaveNome(nome);
}
const MES_CAB = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const normCab = (v) => semAcento(v).toLowerCase().replace(/[.:]/g, "").replace(/\s+/g, " ").trim();

function mapaColunas(cab) {
  const m = {};
  cab.forEach((c, i) => {
    const n = normCab(c);
    Object.keys(CAB).forEach((k) => { if (m[k] === undefined && CAB[k].includes(n)) m[k] = i; });
    const mes = MES_CAB.findIndex((x) => n === x || n.startsWith(x + " ") || n.startsWith(x + "/") || (n.length > 3 && n.startsWith(x) && /^[a-z]+$/.test(n)));
    if (mes > -1 && m["m" + mes] === undefined) m["m" + mes] = i;
  });
  return m;
}

/**
 * Abas da planilha → o que importar: { empresas: [nome, documento], documentos: [...], faturamentos: [...], avisos, abas: [{ nome, tipo, linhas }] }.
 * toIsoDate: Core.toIsoDate (datas do Excel ou dd/mm/aaaa). ano: para faturamento quando a aba não diz o ano.
 */
export function lerPlanilhaCadastro(abas, toIsoDate, ano) {
  const plano = { empresas: [], documentos: [], faturamentos: [], alvaras: [], avisos: [], abas: [] };
  const vistas = {};
  /** Junta a empresa no plano e devolve a chave (CNPJ ou nome). */
  const empresa = (nome, documento, extra) => {
    if (!chaveNome(nome)) return "";
    const k = chaveEmpresa(nome, documento);
    if (!vistas[k]) { vistas[k] = { chave: k, nome: txt(nome), documento: txt(documento), regime: "", codigo: "" }; plano.empresas.push(vistas[k]); }
    if (extra) Object.keys(extra).forEach((c) => { const v = extra[c]; if ((v && !Array.isArray(v) || Array.isArray(v) && v.length) && !(vistas[k][c] && (!Array.isArray(vistas[k][c]) || vistas[k][c].length))) vistas[k][c] = v; });
    return k;
  };
  const mesDe = (v) => { const t = txt(v); const m = /^(\d{1,2})\/(\d{4})$/.exec(t); if (m) return m[2] + "-" + m[1].padStart(2, "0"); const d = toIsoDate(v); return d ? d.slice(0, 7) : ""; };
  const json = (v) => { try { const a = JSON.parse(txt(v) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  abas.forEach((a) => {
    const rows = a.rows || [];
    let h = rows.findIndex((r, i) => i < 10 && r && r.filter((c) => txt(c)).length >= 2);
    if (h < 0) return;
    const col = mapaColunas(rows[h]);
    const meses = MES_CAB.map((_, i) => col["m" + i]).filter((x) => x !== undefined).length;
    const get = (r, k) => (col[k] === undefined ? "" : r[col[k]]);
    let tipo = "", n = 0;
    if (col.empresa === undefined) { plano.abas.push({ nome: a.nome, tipo: "ignorada", linhas: 0 }); return; }
    const colsAlv = Object.keys(COL_ALVARA).filter((c) => col[c] !== undefined);
    if (colsAlv.length >= 2) {
      tipo = "alvaras";
      rows.slice(h + 1).forEach((r, i) => {
        if (!r || !txt(get(r, "empresa"))) return;
        const doc = txt(get(r, "documento"));
        if (doc.replace(/\D/g, "").length < 11) plano.avisos.push("Aba \"" + a.nome + "\", linha " + (h + i + 2) + ": sem CNPJ, a empresa é reconhecida pelo nome.");
        const k = empresa(get(r, "empresa"), doc, { cidade: txt(get(r, "cidade")), uf: txt(get(r, "uf")).toUpperCase(), envioTaxas: txt(get(r, "envioTaxas")) });
        const resp = txt(get(r, "responsavel"));
        colsAlv.forEach((c) => {
          const cel = lerCelulaAlvara(get(r, c), toIsoDate);
          if (cel) plano.alvaras.push(Object.assign({ chave: k, empresa: txt(get(r, "empresa")), tipo: COL_ALVARA[c], responsavel: resp }, cel));
        });
        n++;
      });
    } else if (col.vencimento !== undefined) {
      tipo = "documentos";
      rows.slice(h + 1).forEach((r, i) => {
        if (!r || !txt(get(r, "empresa"))) return;
        const venc = toIsoDate(get(r, "vencimento"));
        const t = txt(get(r, "tipo"));
        if (!venc || !t) { plano.avisos.push("Aba \"" + a.nome + "\", linha " + (h + i + 2) + ": sem " + (!t ? "tipo" : "vencimento") + ", ficou de fora."); return; }
        const k = empresa(get(r, "empresa"), get(r, "documento"));
        plano.documentos.push({ chave: k, empresa: txt(get(r, "empresa")), tipo: t, modelo: txt(get(r, "modelo")), numero: txt(get(r, "numero")), emissao: toIsoDate(get(r, "emissao")) || "",
          vencimento: venc, responsavel: txt(get(r, "responsavel")) });
        n++;
      });
    } else if (meses >= 6) {
      tipo = "faturamentos";
      const anoAba = (/(20\d{2})/.exec(a.nome) || /(20\d{2})/.exec(rows[h].join(" ")) || [])[1] || String(ano);
      rows.slice(h + 1).forEach((r) => {
        if (!r || !txt(get(r, "empresa")) || /^total/i.test(txt(get(r, "empresa")))) return;
        const k = empresa(get(r, "empresa"), get(r, "documento"));
        MES_CAB.forEach((_, i) => {
          const v = get(r, "m" + i);
          const num = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
          if (txt(v) !== "" && isFinite(num)) { plano.faturamentos.push({ chave: k, empresa: txt(get(r, "empresa")), ano: anoAba, mes: String(i + 1).padStart(2, "0"), valor: Math.abs(num) }); }
        });
        n++;
      });
    } else {
      tipo = "empresas";
      // colunas S/N de departamento (Acessórias): o Acessórias é a fonte, então os dados dela atualizam o que já existe
      const deptos = [];
      rows[h].forEach((c, i) => { const d = DEPTOS_ACESSORIAS[normCab(c)]; if (d) deptos.push([i, d]); });
      const acessorias = deptos.length >= 3 || col.fantasia !== undefined && col.ie !== undefined;
      if (acessorias) tipo = "acessorias";
      rows.slice(h + 1).forEach((r, i) => {
        if (!r || !txt(get(r, "empresa"))) return;
        const docLinha = txt(get(r, "documento"));
        if (docLinha && !documentoValido(docLinha)) plano.avisos.push("Aba \"" + a.nome + "\", linha " + (h + i + 2) + ": CNPJ/CPF \"" + docLinha + "\" inválido (" + txt(get(r, "empresa")) + ").");
        if (acessorias) {
          const k = empresa(get(r, "empresa"), docLinha, { codigo: txt(get(r, "codigo")), fantasia: txt(get(r, "fantasia")), apelido: txt(get(r, "apelido")),
            contato: txt(get(r, "contato")), email: txt(get(r, "email")), telefone: txt(get(r, "telefone")), ie: txt(get(r, "ie")), ieUf: txt(get(r, "ieUf")).toUpperCase(),
            regime: regimePeloTexto(get(r, "regime")), cidade: txt(get(r, "cidade")), uf: txt(get(r, "uf")).toUpperCase(),
            segmento: txt(get(r, "segmento")), obs: txt(get(r, "obs")), inicio: mesDe(get(r, "entrada")), saida: mesDe(get(r, "saida")) });
          const v = vistas[k];
          v.atualizar = true;
          // contatos e inscrições estaduais: uma linha por registro, repetindo a empresa
          const ct = { nome: txt(get(r, "contato")), email: txt(get(r, "email")), telefone: txt(get(r, "telefone")) };
          v.contatos = v.contatos || [];
          if ((ct.nome || ct.email || ct.telefone) && !v.contatos.some((x) => x.nome === ct.nome && x.email === ct.email && x.telefone === ct.telefone)) v.contatos.push(ct);
          const ie = { ie: txt(get(r, "ie")), uf: txt(get(r, "ieUf")).toUpperCase() };
          v.ies = v.ies || [];
          if (ie.ie && !v.ies.some((x) => x.ie === ie.ie && x.uf === ie.uf)) v.ies.push(ie);
          v.departamentos = v.departamentos || [];
          deptos.forEach(([c, d]) => { if (/^(s|sim|x)$/i.test(txt(r[c])) && v.departamentos.indexOf(d) < 0) v.departamentos.push(d); });
          n++;
          return;
        }
        let socios = [];
        try {
          socios = limparSocios(json(get(r, "socios")).map((x) => ({ nome: x.nome, cpf: x.cpf, percentual: x.percentual,
            entrada: toIsoDate(x.dataEntrada || x.entrada) || "", saida: toIsoDate(x.dataSaida || x.saida) || "" })));
        } catch (e) { plano.avisos.push("Aba \"" + a.nome + "\", linha " + (h + i + 2) + ": sócios não importados (" + e.message + ")"); }
        const tlr = txt(get(r, "tipoLucroReal"));
        const resp = {};
        [["contabil", "respContabil"], ["fiscal", "respFiscal"], ["dp", "respDp"]].forEach(([s, c]) => { if (simNao(get(r, c))) return; const v = nomeDoEmail(get(r, c)); if (v) resp[s] = v; });
        // no sistema antigo a coluna "Responsavel" é o responsável contábil
        if (!resp.contabil && col.responsavel !== undefined && nomeDoEmail(get(r, "responsavel"))) resp.contabil = nomeDoEmail(get(r, "responsavel"));
        const hist = json(get(r, "respHist")).map((x) => ({ desde: mesDe(x.inicio), nome: nomeDoEmail(x.email || x.nome) })).filter((x) => x.nome);
        empresa(get(r, "empresa"), get(r, "documento"), {
          regime: regimePeloTexto(get(r, "regime")), codigo: txt(get(r, "codigo")), segmento: txt(get(r, "segmento")), contato: txt(get(r, "contato")),
          obs: txt(get(r, "obs")), socios, tipoLucroReal: TIPOS_LUCRO_REAL.find((x) => chaveNome(x) === chaveNome(tlr)) || "",
          inicio: mesDe(get(r, "entrada")), saida: mesDe(get(r, "saida")), baixa: toIsoDate(get(r, "baixa")) || "",
          responsaveis: Object.keys(resp).length ? resp : null, histContabil: hist.length ? hist : null,
          cidade: txt(get(r, "cidade")), uf: txt(get(r, "uf")).toUpperCase(), fantasia: txt(get(r, "fantasia")), email: txt(get(r, "email")), telefone: txt(get(r, "telefone")),
          ie: txt(get(r, "ie")), ieUf: txt(get(r, "ieUf")).toUpperCase()
        });
        n++;
      });
    }
    plano.abas.push({ nome: a.nome, tipo, linhas: n });
  });
  // a empresa achada só pelo nome (ex.: aba de faturamento) é a mesma que veio com CNPJ, se houver só uma com esse nome
  const comDoc = {};
  plano.empresas.forEach((e) => { if (e.chave[0] === "d") { const n = chaveNome(e.nome); comDoc[n] = comDoc[n] === undefined ? e : null; } });
  const troca = {};
  plano.empresas = plano.empresas.filter((e) => {
    const alvo = e.chave[0] === "n" && comDoc[chaveNome(e.nome)];
    if (!alvo) return true;
    Object.keys(e).forEach((c) => { if (c !== "chave" && e[c] && !(alvo[c] && (!Array.isArray(alvo[c]) || alvo[c].length))) alvo[c] = e[c]; });
    troca[e.chave] = alvo.chave;
    return false;
  });
  [plano.documentos, plano.faturamentos, plano.alvaras].forEach((l) => l.forEach((x) => { if (troca[x.chave]) x.chave = troca[x.chave]; }));
  // com CNPJ primeiro
  plano.empresas.sort((a, b) => (a.chave[0] === "d" ? 0 : 1) - (b.chave[0] === "d" ? 0 : 1));
  return plano;
}

/** deps: { ls (localStorage), agora?, aoMudar? } */
export function criarDepCadastro(deps) {
  const { ls } = deps;
  const agora = deps.agora || (() => new Date());
  const avisar = () => { if (deps.aoMudar) deps.aoMudar(); };
  let seq = 0;
  const novoId = (p) => p + agora().getTime().toString(36) + (seq++).toString(36);
  const hoje = () => { const d = agora(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

  function ler(k, padrao) { try { const v = JSON.parse(ls.getItem(k) || "null"); return v && typeof v === "object" ? v : padrao; } catch (e) { return padrao; } }
  function gravar(k, v) { ls.setItem(k, JSON.stringify(v)); avisar(); }
  // o objeto inteiro do antigo painel é preservado (outros campos continuam como estavam)
  function docs() {
    const e = ler(CHAVE_DOCS, {});
    // "Certificado A1" (como era antes) é lido como Certificado Digital, modelo A1; grava assim na próxima mudança
    const documentos = (Array.isArray(e.documentos) ? e.documentos : []).map((d) => {
      if (!d || !(ehCertificado(d.tipo) || /^alvar|^licen/i.test(semAcentoMin(d.tipo)))) return d;
      const n = normalizarTipo(d.tipo, d.modelo);
      return n.tipo === d.tipo && n.modelo === (d.modelo || "") ? d : Object.assign({}, d, n);
    });
    return Object.assign({}, e, { clientes: Array.isArray(e.clientes) ? e.clientes : [], documentos });
  }
  function dados() {
    const e = ler(CHAVE, {});
    return { faturamentos: e.faturamentos && typeof e.faturamentos === "object" ? e.faturamentos : {},
      demonstrativos: e.demonstrativos && typeof e.demonstrativos === "object" ? e.demonstrativos : {} };
  }

  // ------------------------------------------------------------ empresas
  /**
   * Empresas em ordem de nome, com o que se calcula do CNPJ: filial (true/false) e matrizId (a empresa
   * com a mesma raiz e 0001, quando está cadastrada).
   */
  function empresas() {
    const lista = docs().clientes.slice().sort((a, b) => txt(a.nome).localeCompare(txt(b.nome), "pt-BR"));
    const matrizes = {};
    lista.forEach((c) => { const r = raizCnpj(c.documento); if (r && !ehFilial(c.documento)) matrizes[r] = c.id; });
    const porId = {};
    lista.forEach((c) => { porId[c.id] = c; });
    return lista.map((c) => {
      const matrizId = ehFilial(c.documento) ? matrizes[raizCnpj(c.documento)] || "" : "";
      // filial com a matriz cadastrada usa os sócios da matriz (como no sistema antigo)
      const socios = matrizId ? (porId[matrizId].socios || []) : (c.socios || []);
      return Object.assign({}, c, { regime: regimePeloTexto(c.regime) || txt(c.regime), filial: ehFilial(c.documento), matrizId, socios, sociosDaMatriz: !!matrizId });
    });
  }
  const MES = /^\d{4}-\d{2}$/;
  /** Cadastro geral: nome, CNPJ/CPF, código, regime, cliente desde (inicio) e até (saida), em AAAA-MM. */
  function salvarEmpresa(dadosEmp, id) {
    const nome = txt(dadosEmp.nome);
    if (!nome) throw new Error("Preencha o nome da empresa.");
    const campos = { nome, documento: txt(dadosEmp.documento), codigo: txt(dadosEmp.codigo), regime: txt(dadosEmp.regime), inicio: txt(dadosEmp.inicio), saida: txt(dadosEmp.saida),
      tipoLucroReal: txt(dadosEmp.regime) === "Lucro Real" ? txt(dadosEmp.tipoLucroReal) : "", baixa: txt(dadosEmp.baixa),
      segmento: txt(dadosEmp.segmento), contato: txt(dadosEmp.contato), telefone: txt(dadosEmp.telefone), email: txt(dadosEmp.email), obs: txt(dadosEmp.obs),
      cidade: txt(dadosEmp.cidade), uf: txt(dadosEmp.uf).toUpperCase().slice(0, 2), envioTaxas: txt(dadosEmp.envioTaxas) };
    if (dadosEmp.fantasia !== undefined) campos.fantasia = txt(dadosEmp.fantasia);
    if (dadosEmp.ie !== undefined) campos.ie = txt(dadosEmp.ie);
    if (dadosEmp.ieUf !== undefined) campos.ieUf = txt(dadosEmp.ieUf).toUpperCase().slice(0, 2);
    // dados da consulta à Receita (CNAE, endereço, situação): só entram quando vêm no formulário
    ["cnae", "endereco", "cep", "situacaoReceita", "dataSituacao", "inicioAtividade", "consultaReceita"].forEach((c) => { if (dadosEmp[c] !== undefined) campos[c] = txt(dadosEmp[c]); });
    if (campos.regime && !REGIMES.includes(campos.regime)) throw new Error("Regime inválido.");
    if (campos.tipoLucroReal && !TIPOS_LUCRO_REAL.includes(campos.tipoLucroReal)) throw new Error("Tipo do Lucro Real inválido.");
    if (campos.baixa && !iso(campos.baixa)) throw new Error("Data de baixa inválida.");
    if (dadosEmp.socios !== undefined) campos.socios = limparSocios(dadosEmp.socios);
    if ((campos.inicio && !MES.test(campos.inicio)) || (campos.saida && !MES.test(campos.saida))) throw new Error("Use mês e ano (AAAA-MM).");
    if (campos.inicio && campos.saida && campos.saida < campos.inicio) throw new Error("A saída precisa ser depois do início.");
    const e = docs();
    // o mesmo nome só é permitido com CNPJs diferentes (matriz e filiais)
    const digN = campos.documento.replace(/\D/g, "");
    const rep = e.clientes.find((c) => c.id !== id && chaveNome(c.nome) === chaveNome(nome) && !(digN.length >= 11 && txt(c.documento).replace(/\D/g, "").length >= 11));
    if (rep) throw new Error("Já existe a empresa \"" + rep.nome + "\".");
    const dig = campos.documento.replace(/\D/g, "");
    const mesmoDoc = dig.length >= 11 && e.clientes.find((c) => c.id !== id && txt(c.documento).replace(/\D/g, "") === dig);
    if (mesmoDoc) throw new Error("O CNPJ/CPF já está em \"" + mesmoDoc.nome + "\".");
    let salvo;
    if (id) e.clientes = e.clientes.map((c) => (c.id === id ? (salvo = Object.assign({}, c, campos)) : c));
    else e.clientes = e.clientes.concat(salvo = Object.assign({ id: novoId("cli-"), contato: "", email: "", telefone: "" }, campos));
    if (!salvo) throw new Error("Empresa não encontrada.");
    gravar(CHAVE_DOCS, e);
    return salvo;
  }
  /** Quantos documentos (certidões + alvarás) cada empresa tem. */
  function qtdDocumentos() { const n = {}; docs().documentos.forEach((d) => { n[d.clienteId] = (n[d.clienteId] || 0) + 1; }); return n; }
  /** Só exclui empresa sem documentos (para não sumir certidão sem querer). */
  function excluirEmpresa(id) {
    const e = docs();
    const n = e.documentos.filter((d) => d.clienteId === id).length;
    if (n) throw new Error("A empresa tem " + n + " documento(s). Exclua ou mude os documentos antes.");
    e.clientes = e.clientes.filter((c) => c.id !== id);
    gravar(CHAVE_DOCS, e);
    const d = dados();
    Object.keys(d.faturamentos).forEach((ano) => { delete d.faturamentos[ano][id]; });
    Object.keys(d.demonstrativos).forEach((ano) => { delete d.demonstrativos[ano][id]; });
    gravar(CHAVE, d);
  }

  // ------------------------------------------------------------ certidões e alvarás
  /** Documentos de um grupo, com empresa e situação, vencidos primeiro. */
  function documentos(grupo) {
    const e = docs(), h = hoje();
    const porId = {};
    e.clientes.forEach((c) => { porId[c.id] = c; });
    return e.documentos.filter((d) => grupoDoTipo(d.tipo) === grupo)
      .map((d) => { const c = porId[d.clienteId]; return Object.assign({}, d, { empresa: c ? c.nome : "(empresa excluída)", cnpj: c ? txt(c.documento) : "",
        contato: c ? { nome: txt(c.contato), email: txt(c.email), telefone: txt(c.telefone) } : { nome: "", email: "", telefone: "" },
        situacao: grupo === "alvaras" ? situacaoAlvara(d, h) : situacao(d.vencimento, h) }); })
      .sort((a, b) => String(a.vencimento || "9999").localeCompare(String(b.vencimento || "9999")) || a.empresa.localeCompare(b.empresa, "pt-BR"));
  }
  function resumo(grupo) {
    const r = { total: 0, vencido: 0, "7": 0, "30": 0, ok: 0 };
    documentos(grupo).forEach((d) => { r.total++; r[d.situacao.status] = (r[d.situacao.status] || 0) + 1; });
    return r;
  }
  /**
   * Grade de alvarás: uma linha por empresa (as baixadas e as que saíram ficam de fora), com o alvará mais recente
   * de cada tipo de ALVARAS_GRADE (ou null = falta informar) e a situação de cada um.
   */
  function gradeAlvaras() {
    const e = docs(), h = hoje();
    const porEmp = {};
    e.documentos.forEach((d) => {
      if (grupoDoTipo(d.tipo) !== "alvaras" || !ALVARAS_GRADE.includes(d.tipo)) return;
      const m = porEmp[d.clienteId] = porEmp[d.clienteId] || {};
      const atual = m[d.tipo];
      if (!atual || String(d.vencimento || "") > String(atual.vencimento || "") || (!atual.vencimento && !d.vencimento && String(d.criadoEm || "") >= String(atual.criadoEm || ""))) m[d.tipo] = d;
    });
    const linhas = e.clientes.filter((c) => !c.baixa && !c.saida).slice().sort((a, b) => txt(a.nome).localeCompare(txt(b.nome), "pt-BR")).map((c) => {
      const alv = {}, sit = {};
      ALVARAS_GRADE.forEach((t) => {
        const d = (porEmp[c.id] || {})[t] || null;
        alv[t] = d ? Object.assign({}, d, { empresa: c.nome, cnpj: txt(c.documento), contato: { nome: txt(c.contato), email: txt(c.email), telefone: txt(c.telefone) } }) : null;
        sit[t] = situacaoAlvara(d, h);
        if (alv[t]) alv[t].situacao = sit[t];
      });
      const resp = ALVARAS_GRADE.map((t) => alv[t] && alv[t].responsavel).find(Boolean) || "";
      return { empresa: c, alvaras: alv, situacoes: sit, responsavel: resp };
    });
    const r = { linhas, vermelho: 0, amarelo: 0, branco: 0, verde: 0, cinza: 0 };
    linhas.forEach((l) => ALVARAS_GRADE.forEach((t) => { r[l.situacoes[t].cor]++; }));
    return r;
  }

  /**
   * Busca de empresas por CNPJ/CPF (só os números, inteiro ou parte), código ou nome (sem acento).
   * O CNPJ exato vem primeiro, depois o começo do nome, depois o resto. Máximo de 30.
   */
  function buscarEmpresas(texto) {
    const t = txt(texto);
    if (!t) return [];
    const dig = t.replace(/\D/g, ""), n = chaveNome(t);
    const soNumeros = /^[\d.\/\-\s]+$/.test(t);
    const achados = [];
    empresas().forEach((c) => {
      const cd = txt(c.documento).replace(/\D/g, ""), cn = chaveNome(c.nome);
      let nota = 0;
      if (dig.length >= 3 && cd && cd === dig) nota = 100;
      else if (dig.length >= 3 && cd.indexOf(dig) > -1) nota = 80;
      else if (txt(c.codigo) && txt(c.codigo) === t) nota = 90;
      else if (!soNumeros && cn.indexOf(n) === 0) nota = 60;
      else if (!soNumeros && n.length >= 2 && cn.indexOf(n) > -1) nota = 40;
      else if (!soNumeros && n.length >= 2 && chaveNome(c.fantasia).indexOf(n) > -1) nota = 35;
      else if (!soNumeros && n.length >= 2 && chaveNome(c.cidade).indexOf(n) === 0) nota = 20;
      if (nota) achados.push({ nota, c });
    });
    return achados.sort((a, b) => b.nota - a.nota || txt(a.c.nome).localeCompare(txt(b.c.nome), "pt-BR")).slice(0, 30).map((x) => x.c);
  }

  /**
   * Tudo de uma empresa numa tela: dados (com matriz/filiais), os 3 alvarás da grade e os outros, certidões e
   * certificados com a situação, faturamento dos últimos 12 meses (até mesAte, AAAA-MM) e demonstrativos do exercício anterior.
   */
  function fichaEmpresa(id, mesAte) {
    const lista = empresas();
    const c = lista.find((x) => x.id === id);
    if (!c) return null;
    const h = hoje();
    const ate = mesAte || h.slice(0, 7);
    const linha = gradeAlvaras().linhas.find((l) => l.empresa.id === id);
    const alvGrade = {};
    ALVARAS_GRADE.forEach((t) => { alvGrade[t] = { doc: linha ? linha.alvaras[t] : null, situacao: linha ? linha.situacoes[t] : situacaoAlvara(null, h) }; });
    const daEmpresa = (g) => documentos(g).filter((d) => d.clienteId === id);
    const idsGrade = ALVARAS_GRADE.map((t) => alvGrade[t].doc && alvGrade[t].doc.id).filter(Boolean);
    const outrosAlvaras = daEmpresa("alvaras").filter((d) => !idsGrade.includes(d.id));
    const certidoes = daEmpresa("certidoes");
    const meses = [];
    let [a, m] = ate.split("-").map(Number);
    for (let i = 0; i < 12; i++) {
      const mm = String(m).padStart(2, "0");
      const v = ((faturamentos(String(a))[id] || {})[mm]);
      meses.unshift({ mes: a + "-" + mm, valor: typeof v === "number" ? v : null });
      m--; if (!m) { m = 12; a--; }
    }
    const exercicio = String(Number(h.slice(0, 4)) - 1);
    const dem = demonstrativos(exercicio)[id] || {};
    return {
      empresa: c,
      matriz: c.matrizId ? lista.find((x) => x.id === c.matrizId) || null : null,
      filiais: lista.filter((x) => x.matrizId === id),
      alvaras: alvGrade, outrosAlvaras, responsavelAlvaras: linha ? linha.responsavel : "",
      certidoes: certidoes.filter((d) => d.tipo !== CERTIFICADO), certificados: certidoes.filter((d) => d.tipo === CERTIFICADO),
      faturamento: { meses, total: meses.reduce((t, x) => t + (x.valor || 0), 0), comValor: meses.filter((x) => x.valor !== null).length },
      demonstrativos: { exercicio, itens: DEMONSTRATIVOS.map((t) => ({ tipo: t, status: (dem[t] || {}).status || "" })) }
    };
  }

  /** Só os certificados digitais, com os grupos do painel: vencidos, vencem em até 30 dias, em dia e sem data. */
  function certificados() {
    const lista = documentos("certidoes").filter((d) => d.tipo === CERTIFICADO);
    const g = { lista, vencidos: [], ate30: [], emDia: [], semData: [], A1: 0, A3: 0, semModelo: 0 };
    lista.forEach((d) => {
      const s = d.situacao.status;
      (s === "vencido" ? g.vencidos : s === "7" || s === "30" ? g.ate30 : s === "ok" ? g.emDia : g.semData).push(d);
      if (d.modelo === "A1") g.A1++; else if (d.modelo === "A3") g.A3++; else g.semModelo++;
    });
    return g;
  }

  /**
   * Avisos da tela Início: certidões e alvarás vencidos ou vencendo em até 7 dias, e certificados digitais
   * em até 30 dias (a renovação do certificado precisa de agendamento). Vencidos primeiro, depois o mais próximo.
   */
  function avisos() {
    const lista = [];
    ["certidoes", "alvaras"].forEach((grupo) => documentos(grupo).forEach((d) => {
      const cert = d.tipo === CERTIFICADO, s = d.situacao.status;
      if (s === "vencido" || s === "7" || (cert && s === "30")) lista.push(Object.assign({}, d, { grupo: cert ? "certificados" : grupo }));
    }));
    const dias = (d) => (d.situacao.dias === null ? -100000 : d.situacao.dias);   // vencido sem data vem primeiro
    lista.sort((a, b) => dias(a) - dias(b) || a.empresa.localeCompare(b.empresa, "pt-BR"));
    return { lista, vencidos: lista.filter((d) => d.situacao.status === "vencido").length };
  }

  /** Vencidos ou vencendo em até 7 dias (número no menu). */
  function urgentes(grupo) { const r = resumo(grupo); return r.vencido + r["7"]; }

  function salvarDocumento(d, id) {
    const { tipo, modelo } = normalizarTipo(d.tipo, d.modelo), clienteId = txt(d.clienteId);
    if (!clienteId) throw new Error("Escolha a empresa.");
    if (!tipo) throw new Error("Escolha o tipo do documento.");
    const alvara = grupoDoTipo(tipo) === "alvaras";
    const sit = alvara ? txt(d.sitAlvara) : "";
    if (sit && !SITUACOES_ALVARA.some((x) => x.id === sit)) throw new Error("Situação inválida.");
    // alvará pode ficar sem data quando a situação diz o que é (dispensado, solicitado, vencido…)
    if (d.vencimento ? !iso(d.vencimento) : !sit) throw new Error(alvara ? "Preencha a data de vencimento ou escolha a situação." : "Preencha a data de vencimento.");
    if (d.emissao && !iso(d.emissao)) throw new Error("Data de emissão inválida.");
    const e = docs();
    if (!e.clientes.some((c) => c.id === clienteId)) throw new Error("Empresa não encontrada.");
    const campos = { clienteId, tipo, modelo, sitAlvara: sit, numero: txt(d.numero), emissao: d.emissao || "", vencimento: d.vencimento || "", responsavel: txt(d.responsavel), observacoes: txt(d.observacoes), link: txt(d.link) };
    if (campos.link && !/^https?:\/\//i.test(campos.link)) throw new Error("O link precisa começar com http:// ou https://");
    let salvo;
    if (id) e.documentos = e.documentos.map((x) => (x.id === id ? (salvo = Object.assign({}, x, campos)) : x));
    else e.documentos = e.documentos.concat(salvo = Object.assign({ id: novoId("doc-"), andamento: "pendente", criadoEm: hoje(), historico: [] }, campos));
    if (!salvo) throw new Error("Documento não encontrado.");
    gravar(CHAVE_DOCS, e);
    return salvo;
  }
  /** Renovação: guarda o vencimento anterior no histórico (mesmo formato do antigo painel). */
  function renovar(id, novo) {
    if (!iso(novo.vencimento)) throw new Error("Preencha o novo vencimento.");
    const e = docs();
    const d = e.documentos.find((x) => x.id === id);
    if (!d) throw new Error("Documento não encontrado.");
    if (novo.vencimento <= (d.vencimento || "")) throw new Error("O novo vencimento precisa ser depois do atual.");
    d.historico = (Array.isArray(d.historico) ? d.historico : []).concat({
      data: hoje(), vencimentoAnterior: d.vencimento, novoVencimento: novo.vencimento,
      emissaoAnterior: d.emissao || "", numeroAnterior: d.numero || "", obs: txt(novo.obs)
    });
    d.vencimento = novo.vencimento;
    if (d.sitAlvara) d.sitAlvara = "";   // renovado: volta a valer a data
    if (iso(novo.emissao)) d.emissao = novo.emissao;
    if (txt(novo.numero)) d.numero = txt(novo.numero);
    d.andamento = "pendente";
    gravar(CHAVE_DOCS, e);
    return d;
  }
  function excluirDocumento(id) {
    const e = docs();
    const pos = e.documentos.findIndex((x) => x.id === id);
    if (pos < 0) return null;
    const removido = e.documentos[pos];
    e.documentos.splice(pos, 1);
    gravar(CHAVE_DOCS, e);
    return () => { const a = docs(); if (!a.documentos.some((x) => x.id === id)) { a.documentos.splice(Math.min(pos, a.documentos.length), 0, removido); gravar(CHAVE_DOCS, a); } };
  }

  // ------------------------------------------------------------ faturamentos (por empresa e mês)
  function faturamentos(ano) { return dados().faturamentos[ano] || {}; }
  /** valor: número ou null para apagar. */
  function definirFaturamento(ano, empresaId, mes, valor) {
    const d = dados();
    const a = d.faturamentos[ano] = d.faturamentos[ano] || {};
    const e = a[empresaId] = a[empresaId] || {};
    if (valor === null || valor === "" || !isFinite(valor)) delete e[mes]; else e[mes] = Math.round(valor * 100) / 100;
    if (!Object.keys(e).length) delete a[empresaId];
    gravar(CHAVE, d);
  }
  function totalAno(ano, empresaId) {
    const e = faturamentos(ano)[empresaId] || {};
    return Object.keys(e).reduce((t, m) => t + e[m], 0);
  }
  /** Últimos 12 meses até o mês informado (AAAA-MM), somando o ano anterior quando precisa. */
  function ultimos12(empresaId, ate) {
    const [a, m] = ate.split("-").map(Number);
    let t = 0;
    for (let i = 0; i < 12; i++) {
      const d = new Date(a, m - 1 - i, 1);
      const v = (faturamentos(String(d.getFullYear()))[empresaId] || {})[String(d.getMonth() + 1).padStart(2, "0")];
      if (v) t += v;
    }
    return t;
  }

  // ------------------------------------------------------------ demonstrativos (por empresa e ano)
  function demonstrativos(ano) { return dados().demonstrativos[ano] || {}; }
  function definirDemonstrativo(ano, empresaId, tipo, status) {
    if (!STATUS_DEMO.some((s) => s.id === status)) throw new Error("Situação inválida.");
    const d = dados();
    const a = d.demonstrativos[ano] = d.demonstrativos[ano] || {};
    const e = a[empresaId] = a[empresaId] || {};
    if (!status) delete e[tipo]; else e[tipo] = { status, em: hoje() };
    if (!Object.keys(e).length) delete a[empresaId];
    gravar(CHAVE, d);
  }
  function progressoDemonstrativos(ano) {
    const lista = empresas(), d = demonstrativos(ano);
    let total = 0, entregues = 0, emitidos = 0;
    lista.forEach((c) => DEMONSTRATIVOS.forEach((t) => {
      const st = ((d[c.id] || {})[t] || {}).status || "";
      if (st === "nao_se_aplica") return;
      total++;
      if (st === "entregue") entregues++;
      if (st === "emitido") emitidos++;
    }));
    return { total, entregues, emitidos, pendentes: total - entregues - emitidos };
  }


  // ------------------------------------------------------------ importar, demonstração e limpar
  /**
   * Acha a empresa de cada linha do plano: pelo CNPJ/CPF; sem ele, pelo nome (só se houver uma empresa com esse nome).
   * Devolve { mapa: chave → cliente existente | null }.
   */
  function casarEmpresas(plano, clientes) {
    const porDoc = {}, porNome = {};
    clientes.forEach((c) => {
      const d = txt(c.documento).replace(/\D/g, "");
      if (d.length >= 11) porDoc[d] = c;
      const k = chaveNome(c.nome);
      porNome[k] = porNome[k] === undefined ? c : null;   // null = nome repetido (filiais): não dá para escolher
    });
    const mapa = {};
    plano.empresas.forEach((p) => {
      const k = p.chave || chaveEmpresa(p.nome, p.documento);
      const d = txt(p.documento).replace(/\D/g, "");
      mapa[k] = d.length >= 11 ? porDoc[d] || null : porNome[chaveNome(p.nome)] || null;
    });
    return mapa;
  }
  /** O que a importação vai fazer, sem gravar: empresas novas e as que já existem (serão completadas). */
  function previaPlanilha(plano) {
    const mapa = casarEmpresas(plano, docs().clientes);
    let novas = 0, existentes = 0, semCnpj = 0;
    plano.empresas.forEach((p) => {
      if (mapa[p.chave || chaveEmpresa(p.nome, p.documento)]) existentes++; else novas++;
      if (txt(p.documento).replace(/\D/g, "").length < 11) semCnpj++;
    });
    return { novas, existentes, semCnpj, alvaras: (plano.alvaras || []).length, comProblema: (plano.avisos || []).length };
  }

  /**
   * Grava o que lerPlanilhaCadastro achou. A empresa é achada pelo CNPJ (sem ele, pelo nome); as novas são criadas e as
   * que já existem só ganham o que estava vazio. Documentos iguais (empresa+tipo+vencimento) não repetem. Os alvarás da
   * planilha de renovação atualizam o alvará do mesmo tipo da empresa (o vencimento anterior vai para o histórico).
   */
  function aplicarPlanilha(plano) {
    const e = docs();
    let novasEmp = 0, atualizadas = 0, novosDocs = 0, repetidos = 0, alvNovos = 0, alvAtualizados = 0;
    const mapa = casarEmpresas(plano, e.clientes);
    const porChave = {};
    const extras = ["documento", "regime", "codigo", "segmento", "contato", "obs", "tipoLucroReal", "inicio", "saida", "baixa", "cidade", "uf", "envioTaxas",
      "fantasia", "apelido", "email", "telefone", "ie", "ieUf"];
    const listas = ["contatos", "ies", "departamentos"];
    const cheia = (v) => (Array.isArray(v) ? v.length > 0 : !!v);
    plano.empresas.forEach((p) => {
      const k = p.chave || chaveEmpresa(p.nome, p.documento);
      const existe = mapa[k] || porChave[k];
      if (existe) {
        let mudou = false;
        // planilha do Acessórias (a fonte do cadastro): o que veio preenchido atualiza; vazio não apaga. As outras só completam.
        if (p.atualizar && p.nome && existe.nome !== p.nome) { existe.nome = p.nome; mudou = true; }
        extras.concat(listas).forEach((x) => {
          if (!cheia(p[x])) return;
          if (p.atualizar ? JSON.stringify(existe[x]) !== JSON.stringify(p[x]) : !cheia(existe[x])) { existe[x] = p[x]; mudou = true; }
        });
        // o envio das taxas muda a cada ano: a planilha mais nova vale
        if (p.envioTaxas && existe.envioTaxas !== p.envioTaxas) { existe.envioTaxas = p.envioTaxas; mudou = true; }
        if ((!existe.socios || !existe.socios.length) && p.socios && p.socios.length) { existe.socios = p.socios; mudou = true; }
        if (mudou) atualizadas++;
        porChave[k] = existe;
        return;
      }
      // sem CNPJ e com o nome de uma empresa já criada nesta importação: é a mesma
      const mesmoNome = k[0] === "n" && Object.keys(porChave).map((x) => porChave[x]).find((c) => chaveNome(c.nome) === chaveNome(p.nome));
      if (mesmoNome) { porChave[k] = mesmoNome; return; }
      const c = { id: novoId("cli-"), nome: p.nome, contato: "", email: "", telefone: "" };
      extras.forEach((x) => { c[x] = p[x] || ""; });
      listas.forEach((x) => { if (cheia(p[x])) c[x] = p[x]; });
      if (p.socios && p.socios.length) c.socios = p.socios;
      e.clientes.push(c); porChave[k] = c; novasEmp++;
    });
    const cliente = (x) => porChave[x.chave || chaveEmpresa(x.empresa, "")];
    plano.documentos.forEach((d0) => {
      const d = Object.assign({}, d0, normalizarTipo(d0.tipo, d0.modelo));
      const c = cliente(d);
      if (!c) return;
      if (e.documentos.some((x) => x.clienteId === c.id && chaveNome(x.tipo) === chaveNome(d.tipo) && x.vencimento === d.vencimento)) { repetidos++; return; }
      e.documentos.push({ id: novoId("doc-"), clienteId: c.id, tipo: d.tipo, modelo: d.modelo, numero: d.numero, emissao: d.emissao, vencimento: d.vencimento,
        responsavel: d.responsavel, observacoes: "", link: "", andamento: "pendente", criadoEm: hoje(), historico: [] });
      novosDocs++;
    });
    (plano.alvaras || []).forEach((a) => {
      const c = cliente(a);
      if (!c) return;
      // o alvará do mesmo tipo mais recente da empresa
      const atual = e.documentos.filter((x) => x.clienteId === c.id && x.tipo === a.tipo)
        .sort((x, y) => String(y.vencimento || "").localeCompare(String(x.vencimento || "")))[0];
      if (!atual) {
        e.documentos.push({ id: novoId("doc-"), clienteId: c.id, tipo: a.tipo, modelo: "", sitAlvara: a.situacao, numero: "", emissao: "", vencimento: a.vencimento,
          responsavel: a.responsavel, observacoes: a.observacao, link: "", andamento: "pendente", criadoEm: hoje(), historico: [] });
        alvNovos++; return;
      }
      if (a.vencimento && atual.vencimento && a.vencimento > atual.vencimento) {
        atual.historico = (Array.isArray(atual.historico) ? atual.historico : []).concat({ data: hoje(), vencimentoAnterior: atual.vencimento, novoVencimento: a.vencimento,
          emissaoAnterior: atual.emissao || "", numeroAnterior: atual.numero || "", obs: "Importado da planilha" });
      }
      if (a.vencimento) atual.vencimento = a.vencimento;
      atual.sitAlvara = a.situacao;
      if (a.observacao) atual.observacoes = a.observacao;
      if (a.responsavel) atual.responsavel = a.responsavel;
      alvAtualizados++;
    });
    gravar(CHAVE_DOCS, e);
    if (plano.faturamentos.length) {
      const d = dados();
      plano.faturamentos.forEach((f) => {
        const c = cliente(f);
        if (!c) return;
        const a = d.faturamentos[f.ano] = d.faturamentos[f.ano] || {};
        (a[c.id] = a[c.id] || {})[f.mes] = Math.round(f.valor * 100) / 100;
      });
      gravar(CHAVE, d);
    }
    // ids das empresas do plano (pela chave), para quem chama gravar os responsáveis no Em Dia
    const ids = {};
    plano.empresas.forEach((p) => { const k = p.chave || chaveEmpresa(p.nome, p.documento); if (porChave[k]) ids[k] = porChave[k].id; });
    return { novasEmp, atualizadas, novosDocs, repetidos, alvNovos, alvAtualizados, faturamentos: plano.faturamentos.length, ids };
  }

  /** Documento novo a partir de um PDF lido (lerCertidao). Cria a empresa se o CNPJ não estiver cadastrado e vier o nome. */
  function empresaPorDocumento(documento) {
    const dig = String(documento || "").replace(/\D/g, "");
    if (dig.length < 11) return null;
    return docs().clientes.find((c) => String(c.documento || "").replace(/\D/g, "") === dig) || null;
  }

  /** Dados fictícios (ids "ex-") só onde está vazio: empresas, certidões, alvarás, faturamento e demonstrativos. */
  function carregarDemonstracao(exemploDocs) {
    const e = docs();
    let fez = false;
    if (!e.clientes.length && !e.documentos.length) {
      // a demonstração ganha CNPJ, regime e código fictícios, e uma filial da primeira empresa
      const ex = Object.assign({}, exemploDocs, { clientes: (exemploDocs.clientes || []).map((c, i) => Object.assign({}, c, {
        documento: c.documento || (String(i + 1).repeat(2) + "." + String(i + 1).repeat(3) + "." + String(i + 1).repeat(3) + "/0001-" + String(i + 1).repeat(2)),
        regime: c.regime || REGIMES[i % 3], codigo: c.codigo || String(101 + i), tipoLucroReal: REGIMES[i % 3] === "Lucro Real" ? "Trimestral" : "",
        socios: c.socios || [{ nome: "Sócio " + String.fromCharCode(65 + i) + " (exemplo)", cpf: "", percentual: 60, entrada: "", saida: "" },
          { nome: "Sócia " + String.fromCharCode(66 + i) + " (exemplo)", cpf: "", percentual: 40, entrada: "", saida: "" }] })) });
      if (ex.clientes.length) {
        const m = ex.clientes[0];
        ex.clientes = ex.clientes.concat({ id: "ex-filial", nome: m.nome + " (filial)", documento: m.documento.replace("/0001-", "/0002-"), regime: m.regime, codigo: "", contato: "", email: "", telefone: "" });
      }
      gravar(CHAVE_DOCS, Object.assign(e, ex)); fez = true;
    }
    const ids = docs().clientes.map((c) => c.id);
    const d = dados();
    const ano = String(agora().getFullYear()), mesAtual = agora().getMonth() + 1;
    if (!Object.keys(d.faturamentos).length && ids.length) {
      d.faturamentos[ano] = {};
      ids.forEach((id, k) => {
        const base = 18000 + k * 13500;
        d.faturamentos[ano][id] = {};
        for (let m = 1; m < mesAtual; m++) d.faturamentos[ano][id][String(m).padStart(2, "0")] = Math.round(base * (0.85 + ((m * 7 + k * 3) % 10) / 20) * 100) / 100;
      });
      fez = true;
    }
    if (!Object.keys(d.demonstrativos).length && ids.length) {
      const ant = String(agora().getFullYear() - 1);
      d.demonstrativos[ant] = {};
      const sts = ["entregue", "emitido", "", "entregue"];
      ids.forEach((id, k) => {
        d.demonstrativos[ant][id] = {};
        DEMONSTRATIVOS.forEach((t, j) => { const st = j === 2 && k % 2 ? "nao_se_aplica" : sts[(k + j) % 4]; if (st) d.demonstrativos[ant][id][t] = { status: st, em: hoje() }; });
      });
      fez = true;
    }
    if (fez) gravar(CHAVE, d);
    return fez;
  }
  function temDemonstracao() { return docs().clientes.some((c) => /^ex-/.test(c.id)); }
  /** soDemo: tira só o que é fictício (ids "ex-"). Devolve uma função que desfaz. */
  function limpar(soDemo) {
    const antes = { docs: ls.getItem(CHAVE_DOCS), dados: ls.getItem(CHAVE) };
    if (soDemo) {
      const e = docs();
      // empresa fictícia que já recebeu documento de verdade fica (só os documentos fictícios saem)
      e.documentos = e.documentos.filter((x) => !/^ex-/.test(x.id));
      const usadas = new Set(e.documentos.map((x) => x.clienteId));
      const fora = new Set(e.clientes.filter((c) => /^ex-/.test(c.id) && !usadas.has(c.id)).map((c) => c.id));
      e.clientes = e.clientes.filter((c) => !fora.has(c.id));
      gravar(CHAVE_DOCS, e);
      const d = dados();
      // faturamento e demonstrativos de empresas fictícias são fictícios: saem todos
      const ficticias = new Set(((JSON.parse(antes.docs || "{}") || {}).clientes || []).filter((c) => /^ex-/.test(c.id)).map((c) => c.id));
      ["faturamentos", "demonstrativos"].forEach((k) => Object.keys(d[k]).forEach((ano) => ficticias.forEach((id) => { delete d[k][ano][id]; })));
      gravar(CHAVE, d);
    } else {
      gravar(CHAVE_DOCS, { clientes: [], documentos: [] });
      gravar(CHAVE, { faturamentos: {}, demonstrativos: {} });
    }
    return () => {
      if (antes.docs === null) gravar(CHAVE_DOCS, { clientes: [], documentos: [] }); else { ls.setItem(CHAVE_DOCS, antes.docs); avisar(); }
      if (antes.dados !== null) { ls.setItem(CHAVE, antes.dados); avisar(); }
    };
  }
  /** Anexo (PDF) guardado à parte: o documento só leva o nome e o tamanho. */
  function marcarAnexo(id, anexo) {
    const e = docs();
    const d = e.documentos.find((x) => x.id === id);
    if (!d) return;
    if (anexo) d.anexo = { nome: txt(anexo.nome), tamanho: anexo.tamanho || 0 }; else delete d.anexo;
    gravar(CHAVE_DOCS, e);
  }

  return {
    aplicarPlanilha, previaPlanilha, empresaPorDocumento, carregarDemonstracao, temDemonstracao, limpar, marcarAnexo,
    hoje, empresas, salvarEmpresa, excluirEmpresa, qtdDocumentos, documentos, certificados, avisos, gradeAlvaras, buscarEmpresas, fichaEmpresa, resumo, urgentes, salvarDocumento, renovar, excluirDocumento,
    faturamentos, definirFaturamento, totalAno, ultimos12, demonstrativos, definirDemonstrativo, progressoDemonstrativos
  };
}
