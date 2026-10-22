import { useSyncExternalStore } from "react";
import { empresasDasNotas, lerXml, periodoPadrao } from "./icms.mjs";

/*
 * Apuração de ICMS: as notas ficam só na memória desta aba (como no módulo antigo, nada vai para o
 * navegador nem para servidor). Regras de CFOP em "icms.rules" e ajustes em "icms.aj.<CNPJ>.<AAAA-MM>",
 * as mesmas chaves do módulo antigo.
 */
let versao = 0;
const ouvintes = new Set();
function avisar() { versao++; ouvintes.forEach((f) => f()); }
const ler = (k, p) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : p; } catch (e) { return p; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignora */ } };

const s = { notas: new Map(), canceladas: new Set(), ignorados: { resumos: 0, invalidos: 0, outros: 0 }, empresa: "", de: "", ate: "" };

function ajustar() {
  const emps = empresasDasNotas([...s.notas.values()]);
  if (!emps.length) { s.empresa = ""; s.de = ""; s.ate = ""; return; }
  if (!s.empresa || !emps.find((e) => e.doc === s.empresa)) s.empresa = emps[0].doc;
  Object.assign(s, periodoPadrao([...s.notas.values()], s.empresa));
}
const chaveAj = () => "icms.aj." + s.empresa + "." + (s.de || "").slice(0, 7);

export const icms = {
  estado: () => s,
  notas: () => [...s.notas.values()],
  empresas: () => empresasDasNotas([...s.notas.values()]),
  /** textos: [{ nome, texto }]. Devolve { lidas, cancelamentos }. */
  carregar(textos) {
    let lidas = 0, canc = 0;
    textos.forEach(({ texto }) => {
      const r = lerXml(texto);
      if (r.tipo === "nfe") { s.notas.set(r.nota.chave, r.nota); lidas++; }
      else if (r.tipo === "cancelamento") { r.chaves.forEach((c) => s.canceladas.add(c)); canc += r.chaves.length; }
      else if (r.tipo === "resumo") s.ignorados.resumos++;
      else if (r.tipo === "invalido") s.ignorados.invalidos++;
      else s.ignorados.outros++;
    });
    ajustar(); avisar();
    return { lidas, cancelamentos: canc };
  },
  ignorarArquivo() { s.ignorados.outros++; avisar(); },
  limpar() { s.notas.clear(); s.canceladas.clear(); s.ignorados = { resumos: 0, invalidos: 0, outros: 0 }; s.empresa = ""; s.de = ""; s.ate = ""; avisar(); },
  definirEmpresa(doc) { s.empresa = doc; Object.assign(s, periodoPadrao([...s.notas.values()], doc)); avisar(); },
  definirPeriodo(de, ate) { s.de = de; s.ate = ate; avisar(); },
  regras: () => ler("icms.rules", {}),
  definirRegra(k, sim) { const r = ler("icms.rules", {}); r[k] = sim; gravar("icms.rules", r); avisar(); },
  restaurarRegras() { gravar("icms.rules", {}); avisar(); },
  ajustes: () => (s.empresa ? Object.assign({ saldoAnt: 0, outCred: 0, outDeb: 0 }, ler(chaveAj(), {})) : { saldoAnt: 0, outCred: 0, outDeb: 0 }),
  definirAjuste(campo, valor) { if (!s.empresa) return; const a = ler(chaveAj(), {}); a[campo] = valor; gravar(chaveAj(), a); avisar(); }
};

export function useIcms() {
  const v = useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => versao);
  return [icms, v];
}
