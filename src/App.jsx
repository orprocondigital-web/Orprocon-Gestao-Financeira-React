import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth.jsx";
import Layout from "./componentes/Layout.jsx";
import Login from "./paginas/Login.jsx";
import Inicio from "./paginas/Inicio.jsx";
import Modulo from "./paginas/Modulo.jsx";
import EmConstrucao from "./paginas/EmConstrucao.jsx";

function Protegida({ children }) {
  const { carregando, usuario } = useAuth();
  const local = useLocation();
  if (carregando) return <p className="p-8 text-muted" role="status">Carregando seus dados…</p>;
  if (!usuario) return <Navigate to="/login" replace state={{ de: local.pathname }} />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      {/* HashRouter: funciona no GitHub Pages sem configuração de servidor (endereços com #/) */}
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protegida><Layout /></Protegida>}>
            <Route index element={<Inicio />} />
            <Route path="modulo/:id" element={<Modulo />} />
            <Route path="integracao" element={<EmConstrucao nome="A Integração contábil" />} />
            <Route path="conciliacao" element={<EmConstrucao nome="A Conciliação" />} />
            <Route path="conta/:id" element={<EmConstrucao nome="A tela das contas" />} />
            <Route path="cadastro/:id" element={<EmConstrucao nome="A tela dos cadastros" />} />
            <Route path="usuarios" element={<EmConstrucao nome="A tela de Usuários" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
