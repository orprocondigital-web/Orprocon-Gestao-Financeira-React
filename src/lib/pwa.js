import { useSyncExternalStore } from "react";

/*
 * App instalável: registra o service worker (dist/sw.js, gerado no build), avisa quando há versão nova
 * e guarda o pedido de instalação do navegador para o botão "Instalar app".
 * Em desenvolvimento (npm run dev) não registra, para não guardar arquivos que mudam a toda hora.
 */
let estado = { atualizar: null, instalar: null, atualizando: false };
const ouvintes = new Set();
function mudar(x) { estado = Object.assign({}, estado, x); ouvintes.forEach((f) => f()); }

export function usePwa() {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => estado);
}

/** Pede para a versão nova entrar; a página recarrega quando ela assumir. */
export function atualizarAgora() {
  if (!estado.atualizar) return;
  mudar({ atualizando: true });
  estado.atualizar.postMessage("atualizar");
}
/** Abre a janela de instalação do navegador (Chrome/Edge). */
export function instalarApp() {
  const p = estado.instalar;
  if (!p) return;
  p.prompt();
  p.userChoice.finally(() => mudar({ instalar: null }));
}

export function iniciarPwa() {
  window.addEventListener("beforeinstallprompt", (ev) => { ev.preventDefault(); mudar({ instalar: ev }); });
  window.addEventListener("appinstalled", () => mudar({ instalar: null }));
  if (!import.meta.env.PROD || !("serviceWorker" in navigator) || location.protocol === "file:") return;

  let recarregando = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // só recarrega quem pediu a atualização (na primeira instalação não há o que recarregar)
    if (recarregando || !estado.atualizando) return;
    recarregando = true;
    location.reload();
  });
  let feito = false;
  const acompanhar = (reg) => {
    if (feito) return;
    feito = true;
    const observar = (novo) => {
      if (!novo) return;
      novo.addEventListener("statechange", () => {
        if (novo.state === "installed" && navigator.serviceWorker.controller) mudar({ atualizar: novo });
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) mudar({ atualizar: reg.waiting });
    observar(reg.installing);
    reg.addEventListener("updatefound", () => observar(reg.installing));
    // sistema aberto o dia todo: procura versão nova a cada hora e quando a internet volta
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    window.addEventListener("online", () => reg.update().catch(() => {}));
  };
  window.addEventListener("load", () => {
    // sem internet o registro falha, mas o app já instalado continua valendo
    navigator.serviceWorker.register("./sw.js").then(acompanhar).catch((e) => console.warn("Não foi possível procurar versão nova agora:", e && e.message));
    navigator.serviceWorker.ready.then(acompanhar);
  });
}
