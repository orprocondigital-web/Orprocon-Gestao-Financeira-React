/*
 * PDFs anexados aos documentos do Departamento Cadastro.
 *
 * Com o servidor ligado: o arquivo vai para a API (/api/arquivos, que guarda no Supabase Storage) e qualquer
 * pessoa da área abre de qualquer computador. Os PDFs que já estavam guardados só num navegador (versões
 * anteriores) sobem uma vez, sozinhos, na primeira vez que esse navegador abre o sistema (subirDoNavegador).
 * Sem servidor: tudo continua no navegador, como antes.
 *
 * Sem tela e sem navegador: testado em tests/anexos.test.js (fetch e "banco do navegador" de mentira).
 */

/**
 * comServidor: há API? · chamar(metodo, caminho, corpo?, cabecalhos?) → Promise<Response-like { ok, status, blob(), json() }>
 * local: { get(id), put(id, blob), del(id), ids() } (banco do navegador) · documentosExistentes(): Set de ids que ainda existem.
 */
export function criarAnexos({ comServidor, chamar, local, documentosExistentes = () => null }) {
  const caminho = (id) => "/api/arquivos/" + encodeURIComponent(id);

  async function erroDe(r) {
    let msg = "";
    try { const j = await r.json(); msg = (j && (j.mensagem || j.message)) || ""; } catch (e) { /* sem corpo */ }
    if (r.status === 403) return new Error(msg || "Você não tem acesso aos anexos do Departamento Cadastro.");
    if (r.status === 413) return new Error(msg || "O arquivo passa de 10 MB.");
    return new Error(msg || "O servidor não aceitou o arquivo (" + r.status + ").");
  }

  /** Guarda o arquivo do documento (troca o anterior). */
  async function guardar(id, arquivo) {
    if (!comServidor) return local.put(id, arquivo);
    let r;
    try {
      r = await chamar("POST", caminho(id) + "?nome=" + encodeURIComponent((arquivo && arquivo.name) || "arquivo.pdf"), arquivo,
        { "Content-Type": (arquivo && arquivo.type) || "application/pdf" });
    } catch (e) { throw new Error("Sem conexão com o servidor: o PDF não foi enviado. Tente de novo."); }
    if (!r.ok) throw await erroDe(r);
    await local.del(id).catch(() => {});
  }

  /**
   * O arquivo do documento (Blob). Com servidor: busca na API; se ainda não está lá mas está neste navegador
   * (anexado numa versão anterior), usa o daqui e já manda para o servidor.
   */
  async function ler(id) {
    if (comServidor) {
      let r = null;
      try { r = await chamar("GET", caminho(id)); } catch (e) { r = null; }
      if (r && r.ok) return r.blob();
      if (r && r.status !== 404) throw await erroDe(r);
      const daqui = await local.get(id).catch(() => null);
      if (daqui) { guardar(id, daqui).catch(() => {}); return daqui; }
      if (!r) throw new Error("Sem conexão com o servidor: não deu para abrir o PDF.");
      throw new Error("O PDF deste documento não está no servidor. Anexe de novo pelo Editar.");
    }
    const a = await local.get(id);
    if (!a) throw new Error("O PDF não está neste computador (os anexos ficam no navegador onde foram importados).");
    return a;
  }

  /** Tira o arquivo do documento (no servidor e neste navegador). */
  async function apagar(id) {
    await local.del(id).catch(() => {});
    if (!comServidor) return;
    try { await chamar("DELETE", caminho(id)); } catch (e) { /* sem conexão: fica sobrando no servidor, sem prejuízo */ }
  }

  /**
   * Sobe para o servidor, uma vez, os PDFs que só existem neste navegador (de documentos que ainda existem).
   * Devolve { subiram, falharam, ignorados }. Sem permissão (403), para na hora e não tenta de novo.
   */
  async function subirDoNavegador() {
    const res = { subiram: 0, falharam: 0, ignorados: 0 };
    if (!comServidor) return res;
    const ids = await local.ids().catch(() => []);
    if (!ids.length) return res;
    const existem = documentosExistentes();
    for (const id of ids) {
      if (existem && !existem.has(id)) { await local.del(id).catch(() => {}); res.ignorados++; continue; }
      const a = await local.get(id).catch(() => null);
      if (!a) continue;
      let r;
      try {
        r = await chamar("POST", caminho(id) + "?nome=" + encodeURIComponent(a.name || id + ".pdf"), a, { "Content-Type": a.type || "application/pdf" });
      } catch (e) { res.falharam++; break; }   // sem conexão: tenta na próxima abertura
      if (r.status === 403) break;
      if (r.ok) { await local.del(id).catch(() => {}); res.subiram++; } else res.falharam++;
    }
    return res;
  }

  return { guardar, ler, apagar, subirDoNavegador };
}
