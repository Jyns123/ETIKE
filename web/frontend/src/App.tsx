import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, onExpirar } from "./api";
import Dashboard from "./components/Dashboard";
import Interno from "./components/Interno";
import Login from "./components/Login";
import { useLocal } from "./hooks";
import type { Sesion } from "./types";

export type Tema = "sistema" | "claro" | "oscuro";

export default function App() {
  const [sesion, setSesion] = useState<Sesion | null | undefined>(undefined);
  const [aviso, setAviso] = useState<string | null>(null);
  const [tema, setTema] = useLocal<Tema>("cf-tema", "sistema");
  const habiaSesion = useRef(false);
  useEffect(() => {
    habiaSesion.current = !!sesion;
  }, [sesion]);

  useEffect(() => {
    const raiz = document.documentElement;
    if (tema === "sistema") delete raiz.dataset.theme;
    else raiz.dataset.theme = tema === "oscuro" ? "dark" : "light";
  }, [tema]);

  useEffect(() => {
    api.get<Sesion>("/api/auth/sesion").then(setSesion, () => setSesion(null));
    return onExpirar(() => {
      // el chequeo inicial tambien da 401 cuando no hay sesion: eso no es "expirar"
      if (habiaSesion.current) setAviso("Tu sesión se cerró por inactividad. Vuelve a ingresar.");
      setSesion(null);
    });
  }, []);

  const salir = useCallback(async () => {
    await api.post("/api/auth/logout").catch(() => undefined);
    setSesion(null);
    setAviso("Cerraste sesión. Tu cookie de sesión fue invalidada en el servidor.");
  }, []);

  const alternarTema = () => {
    const oscuroAhora =
      tema === "oscuro" || (tema === "sistema" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setTema(oscuroAhora ? "claro" : "oscuro");
  };

  if (sesion === undefined) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div key={sesion ? sesion.rol : "login"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
        {!sesion ? (
          <Login
            aviso={aviso}
            onLogin={async () => {
              setAviso(null);
              setSesion(await api.get<Sesion>("/api/auth/sesion"));
            }}
          />
        ) : sesion.rol === "cliente" ? (
          <Dashboard sesion={sesion} onSalir={salir} onTema={alternarTema} />
        ) : (
          <Interno sesion={sesion} onSalir={salir} onTema={alternarTema} />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
