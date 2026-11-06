/*
 * Acessórias pelo servidor (/api/acessorias; o token do Acessórias fica só no servidor). Regras em acessorias.mjs.
 *
 * - Quem tem o Departamento Cadastro: ao entrar (e a cada 30 min com o sistema aberto), se o servidor sincronizou
 *   depois da última vez, as empresas do Acessórias entram no Cadastro sozinhas, pelo mesmo caminho da planilha
 *   (o que veio preenchido atualiza; nada do que só existe na Central some). O registro de "até quando já entrou"
 *   fica em depCadastro:acessorias, sincronizado com o servidor: só um navegador faz o trabalho.
 * - Carteira automática: busca as empresas em que a pessoa é responsável (carteiraAtiva.js).
 */
import { CONFIG, Core } from "./legado.js";
import { CHAVE_MARCADOR, abaDasEmpresas, precisaAplicar, responsaveisPorSetor } from "./acessorias.mjs";
import { lerPlanilhaCadastro } from "./depCadastro.mjs";
import { depCadastro } from "./useDepCadastro.js";
import { emDia } from "./useEmDia.js";

const COM_API = !!CONFIG.apiUrl;
const MEIA_HORA = 30 * 60 * 1000;

function token() {
  try { const s = JSON.parse(localStorage.getItem("gf.sessao") || "null"); return (s && s.token) || ""; } catch (e) { return ""; }
}

async function chamar(metodo, caminho) {
  let r;
  try {
    r = await fetch(String(CONFIG.apiUrl).replace(/\/+$/, "") + caminho, { method: metodo, headers: { Accept: "application/json", Authorization: "Bearer " + token() } });
  } catch (e) { throw new Error("Sem conexão com o servidor."); }
  const texto = await r.text();
  let dado = null;
  try { dado = texto ? JSON.parse(texto) : null; } catch (e) { dado = null; }
  if (!r.ok) throw Object.assign(new Error((dado && (dado.mensagem || dado.message)) || "O servidor respondeu com erro " + r.status + "."), { status: r.status, codigo: dado && dado.erro });
  return dado;
}

/** { configurado, sincronizando, empresas, ultima, ultimaOk, responsaveisSemAcesso } */
export const statusAcessorias = () => chamar("GET", "/api/acessorias/status");
/** Admin: busca no Acessórias agora (completa = todas as empresas de novo). */
export const sincronizarAcessorias = (completa) => chamar("POST", "/api/acessorias/sincronizar?completa=" + (completa ? "true" : "false"));
/** Empresas do Acessórias com departamentos e responsáveis (admin e Departamento Cadastro). */
export const empresasAcessorias = () => chamar("GET", "/api/acessorias/empresas");
/** CNPJs em que quem está logado é responsável no Acessórias. */
export const minhaCarteiraAcessorias = () => chamar("GET", "/api/acessorias/minha-carteira");

function marcador() {
  try { return JSON.parse(localStorage.getItem(CHAVE_MARCADOR) || "null") || {}; } catch (e) { return {}; }
}

/** Passa as empresas do servidor para o Departamento Cadastro. Devolve o resumo da importação. */
export async function aplicarNoCadastro(status) {
  const st = status || await statusAcessorias();
  const empresas = await empresasAcessorias();
  const plano = lerPlanilhaCadastro(abaDasEmpresas(empresas), Core.toIsoDate);
  const r = plano.empresas.length ? depCadastro.aplicarPlanilha(plano) : { novasEmp: 0, atualizadas: 0 };
  // responsáveis de Contábil, Fiscal e Pessoal: os mesmos do Acessórias na grade do Em Dia (e nas colunas de Empresas)
  r.responsaveis = emDia.definirResponsaveis(responsaveisPorSetor(empresas).map((x) => {
    const c = depCadastro.empresaPorDocumento(x.cnpj);
    return c ? { setorId: x.setorId, empresaId: c.id, nome: x.nome } : null;
  }).filter(Boolean));
  localStorage.setItem(CHAVE_MARCADOR, JSON.stringify({ aplicadoEm: (st.ultimaOk && st.ultimaOk.fim) || new Date().toISOString(),
    novas: r.novasEmp || 0, atualizadas: r.atualizadas || 0, responsaveis: r.responsaveis || 0, em: new Date().toISOString() }));
  window.dispatchEvent(new CustomEvent("gf-acessorias", { detail: { status: st, resumo: r } }));
  return r;
}

let ligado = false;

/**
 * Chamado no login (auth.jsx). Para quem tem o Departamento Cadastro: confere agora e a cada 30 min.
 * Erros (servidor dormindo, sem token) não atrapalham nada: tenta na próxima.
 */
export function acompanharAcessorias(usuario) {
  if (!COM_API || !usuario || ligado) return;
  const pode = usuario.perfil === "admin" || (usuario.areas || []).indexOf("mod-vencimentos") > -1;
  if (!pode) return;
  ligado = true;
  const conferir = async () => {
    try {
      const st = await statusAcessorias();
      if (precisaAplicar(st, marcador())) await aplicarNoCadastro(st);
    } catch (e) { /* sem conexão ou sem acesso: fica para a próxima */ }
  };
  setTimeout(conferir, 4000);
  setInterval(conferir, MEIA_HORA);
}

/** O que o Cadastro recebeu por último: { aplicadoEm, novas, atualizadas, em } ou {}. */
export function ultimoRecebido() {
  return marcador();
}
