import type { Factor } from "../types";

const nf0 = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const entero = (x: number) => nf0.format(x);
export const pct = (x: number, dec = 0) =>
  `${new Intl.NumberFormat("es-PE", { maximumFractionDigits: dec, minimumFractionDigits: dec }).format(x * 100)}%`;
export const signo = (x: number) => (x > 0 ? `+${x}` : x < 0 ? `−${Math.abs(x)}` : "0");
/** Montos del dataset original: no son soles, se muestran como unidades monetarias. */
export const monto = (x: number | null | undefined) => (x == null ? "—" : `${nf0.format(x)} u.m.`);

export function anios(x: number) {
  if (x < 1) {
    const m = Math.max(0, Math.round(x * 12));
    return `${m} ${m === 1 ? "mes" : "meses"}`;
  }
  return `${nf1.format(x)} ${x < 2 && nf1.format(x) === "1" ? "año" : "años"}`;
}

export function valorFactor(f: Factor, v: number | null | undefined): string {
  if (v === null || v === undefined) return f.nulo?.etiqueta ?? "Sin dato";
  switch (f.formato) {
    case "pct":
      return pct(v, v < 0.1 ? 1 : 0);
    case "ratio":
      return `${nf2.format(v)}×`;
    case "anios":
      return anios(v);
    case "score01":
      return nf2.format(v);
    case "binario":
      return v >= 1 ? "Sí" : "No";
    default:
      return nf0.format(v);
  }
}

export const HORIZONTE: Record<string, string> = {
  inmediato: "Inmediato",
  medio: "Mediano plazo",
  largo: "Con el tiempo",
};

export const ACCIONES: Record<string, string> = {
  LOGIN: "Inicio de sesión",
  LOGOUT: "Cierre de sesión",
  VER_SCORE: "Se abrió tu score (detalle descifrado)",
  VER_DATOS_CIFRADOS: "Se consultó cómo se guardan tus datos",
  DESCIFRAR: "Se descifró tu ingreso",
  VER_COMUNIDAD: "Comparación anónima con otros clientes",
  LOGIN_LIMITE_IP: "Bloqueo por exceso de intentos",
};

/** Mismas acciones, redactadas en tercera persona para el panel interno. */
export const ACCIONES_INTERNAS: Record<string, string> = {
  ...ACCIONES,
  VER_SCORE: "Vio su score (detalle descifrado)",
  VER_DATOS_CIFRADOS: "Consultó sus datos cifrados",
  DESCIFRAR: "Descifró su ingreso",
  VER_COMUNIDAD: "Vio la comparación anónima",
  VER_RESUMEN_INTERNO: "Vio indicadores internos",
  VER_AUDITORIA: "Vio el registro de auditoría",
  VER_SOLICITUDES: "Vio la lista de solicitudes",
  DECISION_SOLICITUD: "Decidió sobre una solicitud",
};

export function fechaHora(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
