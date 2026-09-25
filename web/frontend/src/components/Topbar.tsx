import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { api, onActividad } from "../api";
import type { Sesion } from "../types";
import { Icono, Logo } from "./ui";

export default function Topbar(props: {
  sesion: Sesion;
  alias?: string;
  secciones: { id: string; label: string }[];
  onSalir: () => void;
  onTema: () => void;
}) {
  const activa = useSeccionActiva(props.secciones.map((s) => s.id));
  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <a className="brand" href="#score" style={{ color: "inherit", textDecoration: "none" }}>
          <Logo /> CrediFácil
        </a>
        <nav className="navlinks" aria-label="Secciones">
          {props.secciones.map((s) => (
            <a key={s.id} href={`#${s.id}`} aria-current={activa === s.id}>
              {activa === s.id && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: "spring", bounce: 0.2, duration: 0.5 }} />}
              {s.label}
            </a>
          ))}
        </nav>
        <div className="topbar-actions">
          <RelojSesion minutos={props.sesion.idle_minutos} />
          <span className="chip" title="Tu alias: así te ven los demás (pseudónimo HMAC)">
            <Icono.escudo size={13} />
            <span className="mono">{props.alias ?? props.sesion.usuario}</span>
          </span>
          <button className="btn btn-ghost icon-btn" onClick={props.onTema} aria-label="Cambiar tema claro/oscuro">
            <Icono.luna />
          </button>
          <button className="btn btn-sm" onClick={props.onSalir}>
            <Icono.salir size={14} /> Salir
          </button>
        </div>
      </div>
    </header>
  );
}

function useSeccionActiva(ids: string[]) {
  const [activa, setActiva] = useState(ids[0]);
  const clave = ids.join();
  useEffect(() => {
    const ids = clave.split(",");
    const obs = new IntersectionObserver(
      (entradas) => {
        const visible = entradas.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiva(visible.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    const t = setTimeout(() => ids.forEach((id) => document.getElementById(id) && obs.observe(document.getElementById(id)!)), 300);
    return () => (clearTimeout(t), obs.disconnect());
  }, [clave]);
  return activa;
}

/** Cuenta regresiva de inactividad: se reinicia con cada llamada a la API
 *  (el servidor hace lo mismo). Avisa en el ultimo minuto. */
function RelojSesion({ minutos }: { minutos: number }) {
  const [ultima, setUltima] = useState(() => Date.now());
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => onActividad(() => setUltima(Date.now())), []);
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const restante = Math.max(0, minutos * 60 - Math.floor((ahora - ultima) / 1000));
  const mm = Math.floor(restante / 60);
  const ss = String(restante % 60).padStart(2, "0");
  const fraccion = restante / (minutos * 60);
  const urgente = restante <= 60;

  useEffect(() => {
    // al llegar a 0 cualquier llamada devolvera 401 y App vuelve al login
    if (restante === 0) api.get("/api/auth/sesion").catch(() => undefined);
  }, [restante]);

  return (
    <div className={`reloj ${urgente ? "urgente" : ""}`} title="Tu sesión se cierra sola tras un tiempo sin actividad">
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="none" stroke="var(--surface-3)" strokeWidth="2.5" />
        <circle cx="10" cy="10" r="8" fill="none" stroke={urgente ? "var(--serious)" : "var(--ink-2)"} strokeWidth="2.5" strokeDasharray={`${fraccion * 50.3} 50.3`} transform="rotate(-90 10 10)" strokeLinecap="round" />
      </svg>
      <span className="tabular">
        {mm}:{ss}
      </span>
      <AnimatePresence>
        {urgente && (
          <motion.button initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} exit={{ opacity: 0, width: 0 }} className="btn btn-sm" onClick={() => api.get("/api/auth/sesion").catch(() => undefined)}>
            Seguir conectado
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
