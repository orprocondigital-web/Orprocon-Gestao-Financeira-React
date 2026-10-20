import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth.jsx";
import Layout from "./componentes/Layout.jsx";
import Login from "./paginas/Login.jsx";
import Inicio from "./paginas/Inicio.jsx";
import Modulo from "./paginas/Modulo.jsx";
import Usuarios from "./paginas/Usuarios.jsx";
import Integracao from "./paginas/Integracao.jsx";
import Conta from "./paginas/Conta.jsx";
import Cadastro from "./paginas/Cadastro.jsx";
import Conciliacao from "./paginas/Conciliacao.jsx";
import DepCadastro from "./paginas/DepCadastro.jsx";
import { AvisosProvider } from "./componentes/Avisos.jsx";
import AvisoAtualizacao from "./componentes/AvisoAtualizacao.jsx";

function Protegida({ children }) {
  const { carregando, usuario } = useAuth();
  const local = useLocation();
  if (carregando) return <p className="p-8 text-muted" role="status">Carregando seus dados…</p>;
  if (!usuario) return <Navigate to="/login" replace state={{ de: local.pathname }} />;
  return children;
}
function SoAdmin({ children }) {
  const { usuario } = useAuth();
  return usuario && usuario.perfil === "admin" ? children : <Navigate to="/" replace />;
}

/** Só quem tem a área (ex.: integracao) entra; os outros voltam ao Início. */
function SoArea({ area, children }) {
  const { pode } = useAuth();
  return pode(area) ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <AvisosProvider>
      {/* HashRouter: funciona no GitHub Pages sem configuração de servidor (endereços com #/) */}
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protegida><Layout /></Protegida>}>
            <Route index element={<Inicio />} />
            <Route path="modulo/:id" element={<Modulo />} />
            <Route path="integracao" element={<SoArea area="integracao"><Integracao /></SoArea>} />
            <Route path="conciliacao" element={<SoArea area="conciliacao"><Conciliacao /></SoArea>} />
            <Route path="conta/:id" element={<SoArea area="integracao"><Conta /></SoArea>} />
            <Route path="cadastro/:id" element={<SoArea area="integracao"><Cadastro /></SoArea>} />
            <Route path="departamento-cadastro/:secao" element={<SoArea area="mod-vencimentos"><DepCadastro /></SoArea>} />
            {/* o antigo Painel de vencimentos virou Certidões e Alvarás */}
            <Route path="modulo/mod-vencimentos" element={<Navigate to="/departamento-cadastro/certidoes" replace />} />
            <Route path="usuarios" element={<SoAdmin><Usuarios /></SoAdmin>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
      <AvisoAtualizacao />
      </AvisosProvider>
    </AuthProvider>
  );
}
