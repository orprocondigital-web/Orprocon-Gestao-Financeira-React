/*
 * Acessórias pela API (o servidor sincroniza; aqui só as regras, sem tela e sem rede):
 *   - as empresas do Acessórias viram as mesmas linhas da planilha de empresas do Acessórias, e entram no
 *     Departamento Cadastro pelo caminho de sempre (lerPlanilhaCadastro + aplicarPlanilha): o que veio preenchido
 *     atualiza, vazio não apaga, nada do que só existe na Central some;
 *   - quando aplicar (o servidor sincronizou depois da última vez que o Cadastro recebeu);
 *   - de quem é cada empresa (responsável de cada departamento, pelo e-mail).
 *
 * Testado em tests/acessorias.test.js.
 */
import { CAB_ACESSORIAS, CAB_CENTRAL } from "./depCadastro.mjs";

const txt = (v) => (v === null || v === undefined ? "" : String(v).trim());
const norm = (v) => txt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.:]/g, "").replace(/\s+/g, " ").trim();

/** Chave do registro guardado (sincronizado com o servidor junto do Departamento Cadastro). */
export const CHAVE_MARCADOR = "depCadastro:acessorias";

/** Colunas de departamento da planilha do Acessórias (as S/N), pela forma normalizada do nome. */
const COLUNAS_DEPTO = (() => {
  const inicio = CAB_ACESSORIAS.indexOf("Alvarás");
  const m = {};
  CAB_ACESSORIAS.slice(inicio).forEach((c) => { m[norm(c)] = c; });
  return m;
})();

/** Coluna S/N do departamento ("Departamento Pessoal", "Pessoal", "DP"...) ou "" se não é um dos do Acessórias. */
export function colunaDoDepartamento(nome) {
  const n = norm(nome);
  if (!n) return "";
  if (COLUNAS_DEPTO[n]) return COLUNAS_DEPTO[n];
  if (COLUNAS_DEPTO["departamento " + n]) return COLUNAS_DEPTO["departamento " + n];
  const curtos = { dp: "Departamento Pessoal", pessoal: "Departamento Pessoal", contabil: "Departamento Contábil", fiscal: "Departamento Fiscal",
    iss: "ISS Serviço Municipal", "certificado": "Certificado Digital" };
  return curtos[n] || "";
}

const mesBR = (iso) => (/^\d{4}-\d{2}/.test(txt(iso)) ? iso.slice(5, 7) + "/" + iso.slice(0, 4) : "");

/**
 * As empresas do servidor (GET /api/acessorias/empresas) como uma aba da planilha de empresas do Acessórias,
 * no formato que lerPlanilhaCadastro já entende: [{ nome, rows }].
 */
export function abaDasEmpresas(empresas) {
  const cab = CAB_ACESSORIAS.concat(CAB_CENTRAL);
  const col = (n) => cab.indexOf(n);
  const rows = [cab];
  (empresas || []).forEach((e) => {
    if (!e || !txt(e.cnpj)) return;
    const r = cab.map(() => "");
    r[col("CNPJ / CPF / CAEPF")] = txt(e.cnpj);
    r[col("Razão Empresa")] = txt(e.razao) || txt(e.cnpj);
    r[col("Nome Fantasia")] = txt(e.fantasia);
    (e.departamentos || []).forEach((d) => { const c = colunaDoDepartamento(d && d.nome); if (c) r[col(c)] = "S"; });
    r[col("Regime")] = txt(e.regime);
    r[col("UF")] = txt(e.uf).toUpperCase().slice(0, 2);
    r[col("Cliente desde")] = mesBR(e.clienteDesde);
    r[col("Saiu em")] = mesBR(e.clienteAte);
    rows.push(r);
  });
  return [{ nome: "Acessórias (API)", rows }];
}

/**
 * O Cadastro precisa receber de novo? Sim quando o servidor terminou uma sincronização que deu certo depois da
 * última que este Cadastro recebeu. status = GET /api/acessorias/status; marcador = { aplicadoEm }.
 */
export function precisaAplicar(status, marcador) {
  const fim = status && status.ultimaOk && status.ultimaOk.fim;
  if (!fim) return false;
  const ja = marcador && marcador.aplicadoEm;
  return !ja || String(fim) > String(ja);
}

/** Setor do Em Dia de cada departamento do Acessórias (os responsáveis aparecem na grade do Em Dia e em Empresas). */
const SETOR_EM_DIA = { "departamento contabil": "contabil", "departamento fiscal": "fiscal", "departamento pessoal": "dp" };

/**
 * Responsáveis do Acessórias para a grade do Em Dia: [{ cnpj, setorId, nome }].
 * Só Contábil, Fiscal e Pessoal (os setores do Em Dia), com o nome do responsável.
 */
export function responsaveisPorSetor(empresas) {
  const r = [];
  (empresas || []).forEach((e) => (e.departamentos || []).forEach((d) => {
    const setorId = SETOR_EM_DIA[norm(colunaDoDepartamento(d && d.nome))];
    const nome = txt(d && d.respNome);
    if (setorId && nome) r.push({ cnpj: txt(e.cnpj).replace(/\D/g, ""), setorId, nome });
  }));
  return r;
}

/** E-mail (minúsculo) → { nome, cnpjs: Set } de quem é responsável por algum departamento. */
export function responsaveis(empresas) {
  const m = {};
  (empresas || []).forEach((e) => (e.departamentos || []).forEach((d) => {
    const em = txt(d && d.respEmail).toLowerCase();
    if (!em) return;
    if (!m[em]) m[em] = { nome: txt(d.respNome), cnpjs: new Set() };
    m[em].cnpjs.add(txt(e.cnpj).replace(/\D/g, ""));
  }));
  return m;
}

/** "agora há pouco", "há 12 min", "há 3 h", "há 2 dias" (vazio sem data). */
export function haQuanto(iso, agora = new Date()) {
  const t = Date.parse(iso || "");
  if (isNaN(t)) return "";
  const min = Math.max(0, Math.round((agora.getTime() - t) / 60000));
  if (min < 2) return "agora há pouco";
  if (min < 60) return "há " + min + " min";
  const h = Math.round(min / 60);
  if (h < 24) return "há " + h + " h";
  const d = Math.round(h / 24);
  return "há " + d + (d === 1 ? " dia" : " dias");
}
