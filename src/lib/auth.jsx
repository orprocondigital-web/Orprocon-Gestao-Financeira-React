import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AuthCore, CONFIG, Store } from "./legado.js";

/*
 * Login: o mesmo AuthCore da versão anterior. Sem servidor, os usuários ficam no navegador
 * (IndexedDB "gestao-financeira"); com CONFIG.apiUrl, vêm da API Java. Mesmo endereço = mesmos
 * usuários e mesma senha do sistema atual.
 */
const Contexto = createContext(null);

export function AuthProvider({ children }) {
  const [estado, setEstado] = useState({ carregando: true, erro: "", auth: null, usuario: null });

  useEffect(() => {
    let vivo = true;
    if (!(window.crypto && window.crypto.subtle)) {
      setEstado({ carregando: false, erro: "O login precisa que o sistema seja aberto pelo link (https), não pelo arquivo do computador.", auth: null, usuario: null });
      return;
    }
    Store.init()
      .then((ok) => {
        if (!ok) throw new Error("Este navegador não permite guardar dados. Verifique se não está numa janela anônima.");
        const auth = AuthCore.criar(Store, localStorage, { modoTeste: !!CONFIG.modoTeste, apiUrl: CONFIG.apiUrl });
        return auth.usuarioAtual().then((u) => {
          if (!vivo) return;
          const usuario = u && !u.trocarSenha ? Object.assign({}, u, { usuarioId: u.id }) : null;
          if (u && u.trocarSenha) auth.sair();
          setEstado({ carregando: false, erro: "", auth, usuario });
        });
      })
      .catch((e) => vivo && setEstado({ carregando: false, erro: e.message, auth: null, usuario: null }));
    return () => { vivo = false; };
  }, []);

  const definirUsuario = useCallback((u) => setEstado((s) => Object.assign({}, s, { usuario: u ? Object.assign({}, u, { usuarioId: u.id }) : null })), []);
  const sair = useCallback(() => (estado.auth ? estado.auth.sair() : Promise.resolve()).then(() => definirUsuario(null)), [estado.auth, definirUsuario]);
  const pode = useCallback((area) => AuthCore.podeAcessar(estado.usuario, area), [estado.usuario]);

  const valor = useMemo(() => Object.assign({}, estado, { definirUsuario, sair, pode }), [estado, definirUsuario, sair, pode]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAuth() { return useContext(Contexto); }
