/*
 * Consulta do CNPJ na base pública da Receita Federal, pela BrasilAPI (gratuita, sem chave).
 * Preenche o cadastro da empresa: razão social, nome fantasia, endereço, CNAE, situação, Simples/MEI e sócios.
 *
 * Com o servidor no ar, a consulta pode passar pela API (CONFIG.apiUrl) para não depender do navegador;
 * por isso a URL e o fetch entram por parâmetro.
 */

export const URL_BRASILAPI = "https://brasilapi.com.br/api/cnpj/v1/";

const txt = (v) => (v === null || v === undefined ? "" : String(v).trim());
const dig = (v) => txt(v).replace(/\D/g, "");

/** CNPJ com os dois dígitos verificadores certos. */
export function cnpjValido(v) {
  const d = dig(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (base) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = base.split("").reduce((t, c, i) => t + Number(c) * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(d.slice(0, 12)), d2 = dv(d.slice(0, 12) + d1);
  return d.slice(12) === String(d1) + String(d2);
}

export function formatarCnpj(v) {
  const d = dig(v);
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : txt(v);
}

/** "4832220000" → "(48) 3222-0000"; celular com 9 dígitos também. */
export function formatarTelefone(v) {
  const d = dig(v);
  if (d.length === 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
  if (d.length === 11) return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  return txt(v);
}

/** Primeira letra de cada palavra em maiúscula, menos as ligações (de, da, e…): "SAO JOSE DOS PINHAIS" → "São José dos Pinhais" fica com o acento que vier. */
export function nomeProprio(v) {
  const pequenas = ["de", "da", "do", "das", "dos", "e", "em"];
  return txt(v).toLowerCase().split(/\s+/).filter(Boolean)
    .map((p, i) => (i > 0 && pequenas.includes(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(" ");
}

/**
 * Resposta da BrasilAPI → campos do cadastro da Central.
 * O regime sugerido vem da opção pelo Simples/MEI; Presumido ou Real a Receita não informa (fica vazio).
 */
export function daReceita(r) {
  r = r || {};
  const cnae = r.cnae_fiscal ? String(r.cnae_fiscal).padStart(7, "0") : "";
  const endereco = [[txt(r.descricao_tipo_logradouro), txt(r.logradouro)].filter(Boolean).join(" "), txt(r.numero), txt(r.complemento), txt(r.bairro)]
    .filter(Boolean).join(", ");
  const regime = r.opcao_pelo_mei === true ? "MEI" : r.opcao_pelo_simples === true ? "Simples Nacional" : "";
  const socios = (Array.isArray(r.qsa) ? r.qsa : []).filter((s) => txt(s.nome_socio))
    .map((s) => ({ nome: nomeProprio(s.nome_socio), qualificacao: txt(s.qualificacao_socio), entrada: txt(s.data_entrada_sociedade) }));
  return {
    documento: formatarCnpj(r.cnpj),
    nome: txt(r.razao_social),
    fantasia: txt(r.nome_fantasia),
    cidade: txt(r.municipio).toUpperCase(),
    uf: txt(r.uf).toUpperCase(),
    cep: dig(r.cep),
    endereco,
    telefone: formatarTelefone(r.ddd_telefone_1),
    email: txt(r.email).toLowerCase(),
    cnae: cnae ? cnae.replace(/^(\d{4})(\d)(\d{2})$/, "$1-$2/$3") + (r.cnae_fiscal_descricao ? " " + txt(r.cnae_fiscal_descricao) : "") : "",
    regime,
    matriz: r.identificador_matriz_filial === 1 || /matriz/i.test(txt(r.descricao_matriz_filial)),
    situacaoReceita: txt(r.descricao_situacao_cadastral).toUpperCase(),
    dataSituacao: txt(r.data_situacao_cadastral),
    inicioAtividade: txt(r.data_inicio_atividade),
    socios
  };
}

/** A empresa não está ATIVA na Receita (baixada, inapta, suspensa, nula)? */
export function situacaoPedeAtencao(situacao) {
  const s = txt(situacao).toUpperCase();
  return !!s && s !== "ATIVA";
}

/**
 * Consulta o CNPJ. opcoes: { fetch, url (base, termina em /), tempo (ms) }.
 * Devolve daReceita(...) ou lança Error com a mensagem para a pessoa.
 */
export async function consultarCnpj(cnpj, opcoes = {}) {
  const d = dig(cnpj);
  if (!cnpjValido(d)) throw new Error("CNPJ inválido: confira os números.");
  const f = opcoes.fetch || globalThis.fetch;
  const base = opcoes.url || URL_BRASILAPI;
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const relogio = ctrl ? setTimeout(() => ctrl.abort(), opcoes.tempo || 12000) : null;
  let r;
  try {
    r = await f(base + d, { headers: { Accept: "application/json" }, signal: ctrl ? ctrl.signal : undefined });
  } catch (e) {
    throw new Error(e && e.name === "AbortError" ? "A Receita demorou para responder. Tente de novo em instantes." : "Sem conexão com a consulta da Receita. Verifique a internet.");
  } finally { if (relogio) clearTimeout(relogio); }
  if (r.status === 404) throw new Error("CNPJ não encontrado na base da Receita.");
  if (r.status === 429) throw new Error("Muitas consultas seguidas. Espere um minuto e tente de novo.");
  if (!r.ok) throw new Error("A consulta da Receita não respondeu agora (erro " + r.status + "). Tente mais tarde.");
  return daReceita(await r.json());
}

/**
 * Junta o que veio da Receita no formulário: só preenche o que está vazio, para não apagar o que a equipe digitou.
 * Devolve { dados, preenchidos: [nomes dos campos] }.
 */
export function completarComReceita(atual, receita) {
  const dados = Object.assign({}, atual);
  const preenchidos = [];
  ["nome", "fantasia", "documento", "cidade", "uf", "telefone", "email", "regime", "cnae", "endereco", "cep"].forEach((c) => {
    if (receita[c] && !txt(dados[c])) { dados[c] = receita[c]; preenchidos.push(c); }
  });
  // a situação e a data da consulta sempre atualizam
  dados.situacaoReceita = receita.situacaoReceita;
  dados.dataSituacao = receita.dataSituacao;
  dados.inicioAtividade = receita.inicioAtividade || txt(dados.inicioAtividade);
  return { dados, preenchidos };
}
