/*
 * Dados dos módulos no servidor (API Java, /api/modulos).
 *
 * Os módulos continuam lendo e gravando no localStorage do navegador, como sempre; este arquivo só mantém o
 * localStorage igual ao servidor:
 *   - ao abrir (com login): baixa tudo o que a pessoa pode ver e grava no navegador. O que só existe no
 *     navegador e ainda não está no servidor sobe (a primeira vez de quem já tinha dados);
 *   - a cada gravação de um módulo: manda para o servidor (espera um instante para juntar gravações seguidas);
 *   - cada chave tem uma versão: se outra pessoa salvou antes, o servidor responde 409 e nada é sobrescrito.
 *
 * Só as chaves dos módulos (as mesmas do ModuloChaves da API) e só valores JSON de objeto ou lista:
 * preferências de tela ("iss:mes", "emDia:aba"...) ficam em cada navegador.
 * Sem tela e sem navegador: testado em tests/sincronizar.test.js.
 */

/** Começo das chaves que ficam no servidor (iguais às da API). */
export const PREFIXOS = ["emDia:", "painelVencimentos:", "depCadastro:", "lucros:", "encerramento:", "iss:", "horas:", "icms.", "ibscbs:", "fan:"];
/** Onde o navegador guarda a versão de cada chave que veio do servidor. */
export const CHAVE_VERSOES = "gf.sinc.versoes";

const FORMATO = /^[A-Za-z0-9._:-]{1,120}$/;

/** A chave é de um módulo que fica no servidor? */
export function chaveDoServidor(k) {
  return typeof k === "string" && FORMATO.test(k) && PREFIXOS.some((p) => k.startsWith(p) && k.length > p.length);
}

/** O valor guardado é um objeto ou lista em JSON (os dados de verdade dos módulos)? */
export function ehDado(v) {
  if (typeof v !== "string" || !v) return false;
  try { const x = JSON.parse(v); return x !== null && typeof x === "object"; } catch (e) { return false; }
}

/**
 * storage: { getItem, setItem, removeItem, keys() } SEM a escuta (gravar aqui não manda de novo para o servidor).
 * chamar(metodo, caminho, corpoTexto?) → Promise<{ ok, status, dado }>; rejeita quando não há conexão.
 * avisar(evento): { tipo: "salvando" | "salvo" | "erro" | "conflito" | "recusado" | "novidades", chave?, chaves? }.
 * agendar/cancelar: setTimeout/clearTimeout (os testes trocam). esperaMs: quanto esperar para juntar gravações.
 */
export function criarSincronizador({ storage, chamar, avisar = () => {}, agendar = setTimeout, cancelar = clearTimeout, esperaMs = 1200, novaTentativaMs = 15000 }) {
  const timers = {};
  const enviando = {};
  const deNovo = {};
  const caminho = (k) => "/api/modulos/" + encodeURIComponent(k);

  function versoes() { try { return JSON.parse(storage.getItem(CHAVE_VERSOES) || "{}") || {}; } catch (e) { return {}; } }
  function guardarVersao(k, v) {
    const vs = versoes();
    if (v === null) delete vs[k]; else vs[k] = v;
    storage.setItem(CHAVE_VERSOES, JSON.stringify(vs));
  }

  /** Quantas chaves ainda não chegaram ao servidor. */
  function pendentes() { return Object.keys(timers).length + Object.keys(enviando).length; }

  /**
   * Primeira coisa depois do login: servidor → navegador. Devolve { mudou: [chaves trocadas no navegador], subiu: [...] }.
   * O que é do servidor vale; o que só existe neste navegador sobe (versão 0 = ainda não existia).
   */
  async function baixar() {
    const r = await chamar("GET", "/api/modulos?valores=true");
    if (!r.ok) throw Object.assign(new Error("Não consegui buscar os dados no servidor (" + r.status + ")."), { status: r.status });
    const lista = Array.isArray(r.dado) ? r.dado : [];
    const mudou = [], noServidor = {};
    const vs = versoes();
    lista.forEach((item) => {
      if (!item || !chaveDoServidor(item.chave)) return;
      noServidor[item.chave] = true;
      const texto = JSON.stringify(item.valor);
      if (storage.getItem(item.chave) !== texto) { storage.setItem(item.chave, texto); mudou.push(item.chave); }
      vs[item.chave] = item.versao;
    });
    // chaves que sumiram do servidor (outra pessoa apagou) e que este navegador já tinha recebido de lá
    Object.keys(vs).forEach((k) => {
      if (!noServidor[k] && vs[k] > 0) { delete vs[k]; if (storage.getItem(k) !== null) { storage.removeItem(k); mudou.push(k); } }
    });
    storage.setItem(CHAVE_VERSOES, JSON.stringify(vs));
    const subir = storage.keys().filter((k) => chaveDoServidor(k) && !noServidor[k] && ehDado(storage.getItem(k)));
    for (const k of subir) await enviar(k);
    return { mudou, subiu: subir };
  }

  /** Um módulo gravou ou apagou a chave: manda para o servidor daqui a pouco (junta gravações seguidas). */
  function marcar(k) {
    if (!chaveDoServidor(k)) return;
    if (timers[k]) cancelar(timers[k]);
    timers[k] = agendar(() => { delete timers[k]; enviar(k); }, esperaMs);
    avisar({ tipo: "salvando", chave: k });
  }

  /** Manda já o que está esperando (ao fechar a aba). */
  function enviarJa() {
    Object.keys(timers).forEach((k) => { cancelar(timers[k]); delete timers[k]; enviar(k); });
  }

  async function enviar(k) {
    if (enviando[k]) { deNovo[k] = true; return; }
    enviando[k] = true;
    try {
      const valor = storage.getItem(k);
      const versao = versoes()[k] || 0;
      let r;
      if (valor === null) {
        if (!versoes()[k]) return;   // nunca esteve no servidor
        r = await chamar("DELETE", caminho(k) + "?versao=" + versao);
        if (r.ok) { guardarVersao(k, null); avisar({ tipo: "salvo", chave: k }); }
      } else {
        if (!ehDado(valor)) return;  // preferência de tela: fica no navegador
        r = await chamar("PUT", caminho(k) + "?versao=" + versao, valor);
        if (r.ok) { guardarVersao(k, r.dado && r.dado.versao); avisar({ tipo: "salvo", chave: k }); }
      }
      if (r.ok) return;
      if (r.status === 409) { avisar({ tipo: "conflito", chave: k }); return; }
      if (r.status === 400 || r.status === 403 || r.status === 413) { avisar({ tipo: "recusado", chave: k, status: r.status }); return; }
      throw new Error("http-" + r.status);
    } catch (e) {
      // sem conexão, servidor acordando (plano gratuito) ou erro 5xx: tenta de novo daqui a pouco
      avisar({ tipo: "erro", chave: k });
      if (!timers[k]) timers[k] = agendar(() => { delete timers[k]; enviar(k); }, novaTentativaMs);
    } finally {
      delete enviando[k];
      if (deNovo[k]) { delete deNovo[k]; enviar(k); }
    }
  }

  /** Alguém mudou algo no servidor desde a última vez? (ao voltar para a aba). Devolve as chaves mais novas lá. */
  async function verificar() {
    let r;
    try { r = await chamar("GET", "/api/modulos"); } catch (e) { return []; }
    if (!r.ok || !Array.isArray(r.dado)) return [];
    const vs = versoes();
    const novas = r.dado.filter((x) => x && chaveDoServidor(x.chave) && (vs[x.chave] || 0) < x.versao && !timers[x.chave] && !enviando[x.chave])
      .map((x) => x.chave);
    if (novas.length) avisar({ tipo: "novidades", chaves: novas });
    return novas;
  }

  return { baixar, marcar, enviar, enviarJa, verificar, pendentes, versoes };
}
