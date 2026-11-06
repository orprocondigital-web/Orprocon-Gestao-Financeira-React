/*
 * Carteira de quem está usando o sistema (regras em carteira.mjs): liga o filtro das telas no login.
 * Departamento Cadastro filtra no próprio serviço; Controle de horas e ISS perguntam a empresaVisivel().
 */
import { criarFiltro } from "./carteira.mjs";
import { depCadastro } from "./useDepCadastro.js";

let filtro = null;

function ligar(usuario) {
  filtro = criarFiltro(usuario, (doc) => {
    const c = depCadastro.empresaPorDocumento(doc);
    return c && Array.isArray(c.departamentos) ? c.departamentos : [];
  });
  depCadastro.definirVisivel(filtro);
}

let pedido = 0;

/**
 * Chamado no login (auth.jsx): usuario com setores e carteira vindos do servidor.
 * Carteira automática pelo Acessórias: liga primeiro com o que já se sabe e, quando a lista de empresas em que ele é o
 * responsável chega do servidor, liga de novo com ela. Sem resposta, fica só com o que foi escolhido à mão.
 */
export function aplicarCarteira(usuario) {
  ligar(usuario);
  const meu = ++pedido;
  if (usuario && usuario.carteiraAcessorias && usuario.perfil !== "admin") {
    import("./acessoriasServidor.js").then((m) => m.minhaCarteiraAcessorias())
      .then((cnpjs) => { if (meu === pedido) ligar(Object.assign({}, usuario, { carteiraResponsavel: Array.isArray(cnpjs) ? cnpjs : [] })); })
      .catch(() => { /* sem conexão: fica com a carteira manual */ });
  }
  if (usuario) import("./acessoriasServidor.js").then((m) => m.acompanharAcessorias(usuario)).catch(() => {});
}

/** A pessoa vê esta empresa? empresa: { documento | cnpj, departamentos? }. Sem carteira: sempre. */
export function empresaVisivel(empresa) {
  return !filtro || filtro(empresa);
}

/** Há filtro de carteira ligado? */
export function carteiraLigada() { return !!filtro; }

/** Para Controle de horas e ISS: empresa sem CNPJ continua aparecendo (não dá para saber de quem é). */
export function empresaVisivelPorCnpj(cnpj) {
  if (!filtro || !String(cnpj || "").replace(/\D/g, "")) return true;
  return filtro({ cnpj });
}

/** ISS: o estado só com as empresas da carteira (o que é gravado continua sendo o estado inteiro). */
export function issDaCarteira(e) {
  if (!filtro || !e) return e;
  const empresas = {};
  Object.keys(e.empresas || {}).forEach((k) => { const emp = e.empresas[k]; if (empresaVisivelPorCnpj(emp && emp.cnpj)) empresas[k] = emp; });
  const meses = {};
  Object.keys(e.meses || {}).forEach((m) => {
    meses[m] = {};
    Object.keys(e.meses[m] || {}).forEach((k) => { if (empresas[k] || !(e.empresas || {})[k]) meses[m][k] = e.meses[m][k]; });
  });
  return Object.assign({}, e, { empresas, meses });
}
