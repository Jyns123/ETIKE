export type Formato = "pct" | "ratio" | "anios" | "score01" | "entero" | "binario";

export interface Tramo {
  desde: number | null;
  hasta: number | null;
  etiqueta: string;
  n: number;
  tasa_default: number;
  woe: number;
  puntos: number;
}

export interface TramoNulo {
  etiqueta: string;
  n: number;
  tasa_default: number;
  woe: number;
  neutral: boolean;
  puntos: number;
}

export interface Factor {
  id: string;
  nombre: string;
  pilar: string;
  formato: Formato;
  riesgo: "sube" | "baja";
  descripcion: string;
  accionable: boolean;
  horizonte: Horizonte;
  beta: number;
  cortes: number[];
  tramos: Tramo[];
  nulo: TramoNulo | null;
  rango_puntos: [number, number];
}

export interface Pilar {
  id: string;
  nombre: string;
  descripcion: string;
}

export interface Banda {
  id: string;
  nombre: string;
  desde: number;
  hasta: number;
}

export interface Tasas {
  aprobacion: number;
  aprobacion_sin_historial: number;
  aprobacion_con_historial: number;
  default_aprobados: number;
  default_aprobados_sin_historial: number;
}

export interface Modelo {
  version: string;
  entrenado_en: string;
  n_entrenamiento: number;
  n_total: number;
  escala: { promedio: number; pdo: number; min: number; max: number; A: number; B: number };
  base: number;
  umbral_apto: number;
  bandas: Banda[];
  pilares: Pilar[];
  factores: Factor[];
  excluidas: { variable: string; nombre: string; motivo: string }[];
  metricas: { auc: number; gini: number; tasa_default_poblacion: number };
  comparacion: {
    auc_tradicional: number;
    auc_scorecard: number;
    costo_auc: number;
    scorecard: Tasas;
    tradicional: Tasas;
  };
  distribucion: { desde: number; n: number; tasa_default: number; n_con_historial: number }[];
  referencia_pilares: Record<"todos" | "aptos" | "sin_historial" | "con_historial", Record<string, number>>;
}

export type Horizonte = "inmediato" | "medio" | "largo";

export interface Sugerencia {
  id: string;
  factores: string[];
  titulo: string;
  detalle: string;
  ganancia: number;
  horizonte: Horizonte;
  cambios: Record<string, number>;
  nuevo_score: number;
  cruza_umbral: boolean;
}

export interface Solicitud {
  ingreso: number | null;
  monto_credito: number | null;
  anualidad: number | null;
  precio_bien: number | null;
  deuda_activa: number | null;
  monto_activo: number | null;
  tipo_contrato: string;
}

export interface FactorCliente {
  id: string;
  valor: number | null;
  tramo: number;
  puntos: number;
}

export interface MiScore {
  alias: string;
  score: number;
  banda: string;
  apto: boolean;
  tiene_historial: boolean;
  percentil: number;
  total_clientes: number;
  pilares: Record<string, number>;
  factores: FactorCliente[];
  solicitud: Solicitud;
  sugerencias: Sugerencia[];
  plan: { alcanzable: boolean; pasos: string[]; score_final: number; faltan: number } | null;
}

export interface Vecino {
  alias: string;
  score_aprox: number;
  banda: string;
  tiene_historial: boolean;
  ingreso_cifrado: string;
  algoritmo: string;
}

export interface DatoCifrado {
  id: string;
  nombre: string;
  ubicacion: string;
  hex: string;
  bytes: number;
  algoritmo: string;
  descifrable: boolean;
  uso: string;
}

export interface Actividad {
  ts: string;
  accion: string;
  recurso: string | null;
  exito: boolean;
  ip: string;
  quien: string;
}

export interface Sesion {
  usuario: string;
  rol: "cliente" | "analista" | "admin";
  expira_en: string;
  idle_minutos: number;
}
