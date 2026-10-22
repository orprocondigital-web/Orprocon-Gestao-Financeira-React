/** Ícones de traço (os mesmos desenhos da versão anterior). */
export const ICONES = {
  inicio: "M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6",
  master: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z",
  conciliacao: "M7 7h11l-3-3M17 17H6l3 3",
  banco: "M3 10l9-6 9 6M5 10v8M19 10v8M9.5 10v8M14.5 10v8M3 20h18",
  unidade: "M4 20V8l8-4 8 4v12M9 20v-6h6v6",
  mov: "M4 7h16M4 12h10M4 17h7",
  cadastro: "M8 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8zM4 8h4M4 12h4M4 16h4",
  usuarios: "M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1.5a4 4 0 0 0-3-3.87M15.5 4.13a3.5 3.5 0 0 1 0 6.75",
  icms: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  ibs: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4",
  iss: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h5",
  horas: "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  venc: "M7 3v3M17 3v3M4 8h16M5 5h14v15H5zM12 12v3l2 1",
  emdia: "M9 3h6v3H9zM7 4.5H5V21h14V4.5h-2M9 13l2 2 4-4",
  seta: "M6 9l6 6 6-6",
  direita: "M9 6l6 6-6 6",
  mais: "M12 5v14M5 12h14",
  fechar: "M6 6l12 12M18 6L6 18",
  lua: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  sol: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  sair: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  cadeado: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2",
  recolher: "M4 4h16v16H4zM9 4v16M16 10l-2 2 2 2",
  menu: "M4 7h16M4 12h16M4 17h16",
  chat: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5",
  ok: "M5 12l5 5 9-10",
  externo: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  instalar: "M12 4v11M7 10l5 5 5-5M5 20h14",
  importar: "M12 20V9M7 14l5-5 5 5M5 4h14",
  certidao: "M7 3h7l5 5v13H7zM14 3v5h5M9.5 14.5l2 2 3.5-4",
  alvara: "M5 4h14v16H5zM9 9h6M9 13h6M12 17h3",
  faturamento: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  paleta: "M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.6-9-7.6zM7.5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM10.5 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM14.5 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  lucros: "M12 3c3.9 0 7 1.3 7 3s-3.1 3-7 3-7-1.3-7-3 3.1-3 7-3zM5 6v4c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 10v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4M5 14v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4",
  fechamento: "M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M8.5 14.5l2.2 2.2 4.8-4.8",
  reinf: "M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h4",
  empresa: "M4 21V5h10v16M14 9h6v12M7 9h4M7 13h4M7 17h4M17 13h1M17 17h1M3 21h18",
  demonstrativo: "M5 3h14v18H5zM9 8h6M9 12h6M9 16h3"
};

export default function Icone({ nome, className = "" }) {
  return (
    <svg className={"ico " + className} viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONES[nome] || ""} />
    </svg>
  );
}
