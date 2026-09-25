// Misma logica que web/backend/app/scoring.py (tramos [a, b), sin dato = -1),
// para que el simulador calcule en el navegador exactamente lo que calcula el servidor.
import type { Factor, MiScore, Modelo } from "../types";

export function tramoDe(f: Factor, valor: number | null | undefined): number {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return -1;
  let i = 0;
  while (i < f.cortes.length && valor >= f.cortes[i]) i++;
  return i;
}

export function puntosDe(f: Factor, valor: number | null | undefined): number {
  const i = tramoDe(f, valor);
  if (i < 0) return f.nulo?.puntos ?? 0;
  return f.tramos[i].puntos;
}

/** Entradas del simulador. monto y cuotas definen la cuota: cuota = monto / cuotas. */
export interface Escenario {
  monto: number;
  cuotas: number;
  valores: Record<string, number | null>;
}

export function escenarioInicial(mi: MiScore): Escenario {
  const { monto_credito, anualidad } = mi.solicitud;
  return {
    monto: monto_credito ?? 0,
    cuotas: monto_credito && anualidad ? monto_credito / anualidad : 0,
    valores: Object.fromEntries(mi.factores.map((f) => [f.id, f.valor])),
  };
}

/** Recalcula los valores derivados de monto/cuotas y los puntos de cada factor. */
export function simular(modelo: Modelo, mi: MiScore, e: Escenario) {
  const { ingreso, precio_bien } = mi.solicitud;
  const valores = { ...e.valores };
  if (ingreso && e.cuotas > 0) valores.carga_cuota = e.monto / e.cuotas / ingreso;
  if (precio_bien) valores.credito_bien = e.monto / precio_bien;
  const puntos: Record<string, number> = {};
  for (const f of modelo.factores) puntos[f.id] = puntosDe(f, valores[f.id]);
  const total = Object.values(puntos).reduce((a, b) => a + b, 0);
  const score = Math.min(modelo.escala.max, Math.max(modelo.escala.min, modelo.base + total));
  return { valores, puntos, score };
}

export function bandaDe(modelo: Modelo, score: number) {
  return modelo.bandas.find((b) => b.desde <= score && score < b.hasta) ?? modelo.bandas[0];
}

/** Tasa de atraso observada entre personas con un score parecido (cubeta de 10). */
export function tasaEnScore(modelo: Modelo, score: number): number {
  const c = Math.floor(score / 10) * 10;
  const exacta = modelo.distribucion.find((d) => d.desde === c && d.n >= 50);
  if (exacta) return exacta.tasa_default;
  const cerca = [...modelo.distribucion].filter((d) => d.n >= 50).sort((a, b) => Math.abs(a.desde - c) - Math.abs(b.desde - c));
  return cerca[0]?.tasa_default ?? modelo.metricas.tasa_default_poblacion;
}
