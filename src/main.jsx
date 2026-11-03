import "./lib/legado.js";   // primeiro: as regras publicam Core, AuthCore, Store...
import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { iniciarPwa } from "./lib/pwa.js";
import { iniciarSincronizacao } from "./lib/sincronizacao.js";

iniciarPwa();   // app instalável e aviso de versão nova (só no site publicado)

// Com o servidor ligado e login feito, os dados dos módulos vêm do servidor ANTES das telas abrirem
// (algumas telas leem o navegador assim que carregam). Por isso o App é carregado só depois.
const raiz = document.getElementById("raiz");
raiz.innerHTML = '<p style="font:15px Arial,sans-serif;color:#64748b;padding:48px;text-align:center">Carregando…</p>';
const lento = setTimeout(() => {
  raiz.innerHTML = '<p style="font:15px Arial,sans-serif;color:#64748b;padding:48px;text-align:center">Buscando os dados no servidor…<br>' +
    '<span style="font-size:13px">Na primeira vez do dia pode levar até 1 minuto.</span></p>';
}, 2500);

iniciarSincronizacao()
  .then(() => import("./App.jsx"))
  .then(({ default: App }) => {
    clearTimeout(lento);
    raiz.innerHTML = "";
    createRoot(raiz).render(<React.StrictMode><App /></React.StrictMode>);
  });
