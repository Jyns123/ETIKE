import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/* ------------------------------------------------------------------ Seccion */

export function Section(props: { id: string; num: string; titulo: string; lead: ReactNode; children: ReactNode }) {
  return (
    <section id={props.id} className="section container" aria-labelledby={`${props.id}-t`}>
      <motion.header
        className="section-head"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="section-num">{props.num}</div>
        <div>
          <h2 className="section-title" id={`${props.id}-t`}>
            {props.titulo}
          </h2>
          <p className="section-lead">{props.lead}</p>
        </div>
      </motion.header>
      {props.children}
    </section>
  );
}

export function Aparece(props: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={props.className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, delay: props.delay ?? 0, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {props.children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ InfoTip */

export function InfoTip({ children, label = "Más información" }: { children: ReactNode; label?: string }) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  return (
    <span className="infotip" onMouseEnter={() => setAbierto(true)} onMouseLeave={() => setAbierto(false)}>
      <button
        type="button"
        className="infotip-btn"
        aria-label={label}
        aria-describedby={abierto ? id : undefined}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        onClick={() => setAbierto((a) => !a)}
      >
        ?
      </button>
      <AnimatePresence>
        {abierto && (
          <motion.span
            id={id}
            role="tooltip"
            className="infotip-pop"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
          >
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/* ------------------------------------------------------------------ Tooltip */

export interface EstadoTooltip {
  x: number;
  y: number;
  contenido: ReactNode;
}

/** Tooltip flotante que sigue al puntero (o al foco del teclado). */
export function Tooltip({ estado }: { estado: EstadoTooltip | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  useEffect(() => {
    if (!estado || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    let left = estado.x + 14;
    let top = estado.y + 14;
    if (left + r.width > window.innerWidth - 8) left = estado.x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = estado.y - r.height - 14;
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [estado]);
  return (
    <AnimatePresence>
      {estado && (
        <motion.div
          ref={ref}
          className="tooltip"
          style={{ left: pos.left, top: pos.top }}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          {estado.contenido}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Posicion para el tooltip desde un evento de puntero o de foco. */
export function posDe(e: React.PointerEvent | React.FocusEvent): { x: number; y: number } {
  if ("clientX" in e) return { x: e.clientX, y: e.clientY };
  const r = (e.target as Element).getBoundingClientRect();
  return { x: r.right, y: r.top };
}

/* ------------------------------------------------------------ Segmentado */

export function Segmentado<T extends string>(props: {
  opciones: { id: T; label: string }[];
  valor: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const grupo = useId();
  return (
    <div className="segmented" role="group" aria-label={props.label}>
      {props.opciones.map((o) => (
        <button key={o.id} type="button" aria-pressed={props.valor === o.id} onClick={() => props.onChange(o.id)}>
          {props.valor === o.id && <motion.span layoutId={grupo} className="seg-pill" transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ Texto cifrado */

const HEX = "0123456789abcdef";

/** Muestra texto hexadecimal "decodificandose": cada caracter gira al azar
 *  hasta asentarse. Sirve para que el cifrado se note como algo real. */
export function Scramble({ texto, activo = true, duracion = 900, className }: { texto: string; activo?: boolean; duracion?: number; className?: string }) {
  const [salida, setSalida] = useState(texto);
  useEffect(() => {
    if (!activo || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSalida(texto);
      return;
    }
    const inicio = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = (t - inicio) / duracion;
      let s = "";
      for (let i = 0; i < texto.length; i++) {
        const umbral = i / texto.length;
        s += p > umbral * 0.8 + 0.2 ? texto[i] : texto[i] === " " ? " " : HEX[(Math.random() * 16) | 0];
      }
      setSalida(s);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setSalida(texto);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [texto, activo, duracion]);
  return (
    <span className={className} aria-label={texto}>
      {salida}
    </span>
  );
}

/* ------------------------------------------------------------ Iconos */

export const Icono = {
  candado: (p: { size?: number }) => (
    <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  check: (p: { size?: number }) => (
    <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
  alerta: (p: { size?: number }) => (
    <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 8v5M12 16.5v.5" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  ),
  flecha: (p: { size?: number }) => (
    <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  play: (p: { size?: number }) => (
    <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
    </svg>
  ),
  sol: (p: { size?: number }) => (
    <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  luna: (p: { size?: number }) => (
    <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </svg>
  ),
  salir: (p: { size?: number }) => (
    <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />
    </svg>
  ),
  ojo: (p: { size?: number; tachado?: boolean }) => (
    <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
      {p.tachado && <path d="M4 20L20 4" />}
    </svg>
  ),
  escudo: (p: { size?: number }) => (
    <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" />
    </svg>
  ),
};

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--ink)" />
      <path d="M8 21a8 8 0 0 1 16 0" fill="none" stroke="var(--pos)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="21.6" cy="15.2" r="2.4" fill="var(--page)" />
    </svg>
  );
}
