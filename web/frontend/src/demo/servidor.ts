// "Servidor" de la demo estatica (GitHub Pages). Responde en el navegador lo
// que en la version real responde FastAPI, con respuestas reales del backend
// exportadas por web/backend/scripts/export_demo.py (src/demo/datos/).
//
// Replica las reglas visibles del backend (roles, bloqueo tras 5 fallos,
// mensaje de error unico, expiracion por inactividad, auditoria de cada
// acceso) para que la demo se comporte igual. NO es una medida de seguridad:
// todo corre en el navegador del visitante y los datos de la demo son
// publicos. La seguridad real (Argon2id, cookie HttpOnly, TLS con CA propia,
// pgcrypto, rol de minimo privilegio) solo existe en la version local.

import type { DatoCifrado, MiScore, Modelo, SolicitudInterna, Vecino } from "../types";
import { PASSWORD_DEMO } from "./Aviso";

type Rol = "cliente" | "analista" | "admin";

interface Cuenta {
  usuario: string;
  rol: Rol;
}

interface DatosCliente {
  score: MiScore;
  datos: DatoCifrado[];
  ingreso: number;
  comunidad: { vecinos: Vecino[] };
}

interface DatosInterno {
  resumen: Record<string, unknown>;
  solicitudes: SolicitudInterna[];
}

interface Evento {
  id: number;
  ts: string;
  usuario: string;
  rol: Rol | null;
  accion: string;
  recurso: string | null;
  exito: boolean;
  /** usuario cliente cuyos datos se tocaron (sk_id_curr_objetivo en la version real) */
  sobre: string | null;
}

interface Estado {
  sesion: { usuario: string; rol: Rol; creada: number; ultima: number } | null;
  fallos: Record<string, { n: number; hasta: number | null }>;
  log: Evento[];
  decisiones: Record<string, { estado: "aprobada" | "rechazada"; por: string; en: string }>;
}

// mismos valores que el backend (app/security.py y .env.example)
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 15 * 60_000;
const IDLE_MIN = 30;
const ABSOLUTA_MS = 8 * 3_600_000;
const ERROR_GENERICO = "Usuario o contraseña incorrectos. Tras 5 intentos fallidos la cuenta se bloquea 15 minutos.";
const IP = "demo";
const CLAVE = "cf-demo-v1";

const archivos = import.meta.glob("./datos/*.json", { import: "default" });
const clientes = import.meta.glob<DatosCliente>("./datos/clientes/*.json", { import: "default" });

const cargar = <T>(nombre: string) => archivos[`./datos/${nombre}.json`]() as Promise<T>;

class Http extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

// El estado vive en sessionStorage: sobrevive a recargar la pagina y se borra
// al cerrar la pestania. Si el storage no esta disponible, queda en memoria.
const estado: Estado = leerEstado();

function leerEstado(): Estado {
  try {
    const s = sessionStorage.getItem(CLAVE);
    if (s) return JSON.parse(s) as Estado;
  } catch {
    /* modo privado o storage bloqueado */
  }
  return { sesion: null, fallos: {}, log: [], decisiones: {} };
}

function guardarEstado() {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(estado));
  } catch {
    /* sin storage: solo en memoria */
  }
}

function registrar(accion: string, exito: boolean, extra: Partial<Evento> = {}) {
  const s = estado.sesion;
  estado.log.push({
    id: (estado.log.at(-1)?.id ?? 0) + 1,
    ts: new Date().toISOString(),
    usuario: s?.usuario ?? "",
    rol: s?.rol ?? null,
    recurso: null,
    sobre: null,
    ...extra,
    accion,
    exito,
  });
  if (estado.log.length > 300) estado.log = estado.log.slice(-300);
}

function sesionActual() {
  const s = estado.sesion;
  if (!s) throw new Http(401, "Sesión no iniciada");
  const ahora = Date.now();
  if (ahora - s.ultima > IDLE_MIN * 60_000 || ahora - s.creada > ABSOLUTA_MS) {
    estado.sesion = null;
    throw new Http(401, "Sesión expirada");
  }
  s.ultima = ahora; // expiracion deslizante, igual que el backend
  return s;
}

function requiere(...roles: Rol[]) {
  const s = sesionActual();
  if (!roles.includes(s.rol)) throw new Http(403, "No tienes permiso para este recurso");
  return s;
}

async function login(cuerpo: { usuario?: string; password?: string }) {
  const nombre = String(cuerpo.usuario ?? "").trim().toLowerCase();
  const cuentas = await cargar<Cuenta[]>("cuentas");
  const u = cuentas.find((c) => c.usuario === nombre);
  const f = (estado.fallos[nombre] ??= { n: 0, hasta: null });
  const bloqueado = f.hasta !== null && f.hasta > Date.now();
  const valido = cuerpo.password === PASSWORD_DEMO;

  if (!u || bloqueado || !valido) {
    if (u && !bloqueado) {
      f.n += 1;
      f.hasta = f.n >= MAX_INTENTOS ? Date.now() + BLOQUEO_MS : null;
    }
    registrar("LOGIN", false, { usuario: nombre.slice(0, 60), rol: u?.rol ?? null });
    throw new Http(401, ERROR_GENERICO);
  }
  estado.fallos[nombre] = { n: 0, hasta: null };
  const ahora = Date.now();
  estado.sesion = { usuario: u.usuario, rol: u.rol, creada: ahora, ultima: ahora };
  registrar("LOGIN", true);
  return { usuario: u.usuario, rol: u.rol };
}

async function cliente(usuario: string) {
  const f = clientes[`./datos/clientes/${usuario}.json`];
  if (!f) throw new Http(404, "Aún no hay un score calculado para tu cuenta");
  return f();
}

async function solicitudes(estadoPedido: string) {
  const { solicitudes } = await cargar<DatosInterno>("interno");
  return solicitudes
    .map((x) => {
      const d = estado.decisiones[x.id];
      return d ? { ...x, estado: d.estado, decidido_por: d.por, decidido_en: d.en } : x;
    })
    .filter((x) => estadoPedido === "todas" || x.estado === estadoPedido)
    .sort((a, b) => a.score - b.score)
    .slice(0, 100);
}

async function manejar(metodo: string, ruta: string, q: URLSearchParams, cuerpo: Record<string, unknown>): Promise<unknown> {
  // --- autenticacion ---
  if (ruta === "/api/auth/login" && metodo === "POST") return login(cuerpo);
  if (ruta === "/api/auth/logout" && metodo === "POST") {
    if (estado.sesion) registrar("LOGOUT", true);
    estado.sesion = null;
    return { ok: true };
  }
  if (ruta === "/api/auth/sesion") {
    const s = sesionActual();
    return {
      usuario: s.usuario,
      rol: s.rol,
      expira_en: new Date(s.creada + ABSOLUTA_MS).toISOString(),
      idle_minutos: IDLE_MIN,
    };
  }

  // --- cliente: todo sale de la sesion, ningun endpoint recibe un ID (anti-IDOR) ---
  if (ruta === "/api/modelo") {
    requiere("cliente", "analista", "admin");
    return cargar<Modelo>("modelo");
  }
  if (ruta === "/api/mi/score") {
    const s = requiere("cliente");
    const d = await cliente(s.usuario);
    registrar("VER_SCORE", true, { recurso: "core.scores.detalle_cifrado", sobre: s.usuario });
    return d.score;
  }
  if (ruta === "/api/mi/datos") {
    const s = requiere("cliente");
    const d = await cliente(s.usuario);
    registrar("VER_DATOS_CIFRADOS", true, { sobre: s.usuario });
    return d.datos;
  }
  if (ruta === "/api/mi/datos/descifrar" && metodo === "POST") {
    const s = requiere("cliente");
    const campo = String(cuerpo.campo ?? "");
    if (campo !== "ingreso") {
      registrar("DESCIFRAR", false, { recurso: campo.slice(0, 60), sobre: s.usuario });
      throw new Http(403, "Este dato no se descifra: la app no lo necesita para tu score");
    }
    const d = await cliente(s.usuario);
    registrar("DESCIFRAR", true, { recurso: "core.solicitudes.ingreso_cifrado", sobre: s.usuario });
    return { campo: "ingreso", valor: d.ingreso };
  }
  if (ruta === "/api/mi/actividad") {
    const s = requiere("cliente");
    return estado.log
      .filter((e) => e.usuario === s.usuario || e.sobre === s.usuario)
      .reverse()
      .slice(0, 30)
      .map((e) => ({
        ts: e.ts,
        accion: e.accion,
        recurso: e.recurso,
        exito: e.exito,
        ip: IP,
        quien: e.usuario === s.usuario ? "Tú" : (e.rol ?? "sistema"),
      }));
  }
  if (ruta === "/api/comunidad") {
    const s = requiere("cliente");
    const d = await cliente(s.usuario);
    registrar("VER_COMUNIDAD", true, { recurso: "core.scores (agregado)" });
    return d.comunidad;
  }

  // --- personal interno (RBAC): agregados, decisiones y auditoria ---
  if (ruta === "/api/interno/resumen") {
    requiere("analista", "admin");
    const { resumen } = await cargar<DatosInterno>("interno");
    const hace24h = Date.now() - 86_400_000;
    const recientes = estado.log.filter((e) => Date.parse(e.ts) > hace24h);
    const seguridad_24h = {
      logins_ok: recientes.filter((e) => e.accion === "LOGIN" && e.exito).length,
      logins_fallidos: recientes.filter((e) => e.accion === "LOGIN" && !e.exito).length,
      descifrados: recientes.filter((e) => e.accion.startsWith("DESCIFRAR")).length,
    };
    registrar("VER_RESUMEN_INTERNO", true, { recurso: "core.scores (agregado)" });
    return { ...resumen, seguridad_24h };
  }
  if (ruta === "/api/interno/auditoria") {
    requiere("admin");
    const filas = estado.log
      .slice()
      .reverse()
      .slice(0, 200)
      .map((e) => ({
        id: e.id,
        ts: e.ts,
        usuario: e.usuario,
        rol: e.rol,
        accion: e.accion,
        recurso: e.recurso,
        exito: e.exito,
        ip: IP,
        sobre_cliente: e.sobre !== null,
      }));
    registrar("VER_AUDITORIA", true, { recurso: "app.logs_auditoria" });
    return filas;
  }
  if (ruta === "/api/interno/solicitudes") {
    requiere("analista", "admin");
    const pedido = q.get("estado") ?? "pendiente";
    if (!["pendiente", "aprobada", "rechazada", "todas"].includes(pedido)) {
      throw new Http(422, "estado debe ser uno de ['aprobada', 'pendiente', 'rechazada', 'todas']");
    }
    const filas = await solicitudes(pedido);
    registrar("VER_SOLICITUDES", true, { recurso: "core.solicitudes (agregado)" });
    return filas;
  }
  const decision = /^\/api\/interno\/solicitudes\/([0-9a-f-]{36})\/decision$/.exec(ruta);
  if (decision && metodo === "POST") {
    const s = requiere("analista", "admin");
    const nuevo = cuerpo.estado;
    if (nuevo !== "aprobada" && nuevo !== "rechazada") throw new Http(422, "Datos inválidos");
    const { solicitudes: todas } = await cargar<DatosInterno>("interno");
    const sol = todas.find((x) => x.id === decision[1]);
    if (!sol) throw new Http(404, "Solicitud no encontrada");
    estado.decisiones[sol.id] = { estado: nuevo, por: s.usuario, en: new Date().toISOString() };
    registrar("DECISION_SOLICITUD", true, { recurso: "app.decisiones", sobre: sol.alias });
    return { ok: true };
  }

  throw new Http(404, "No encontrado");
}

/** Reemplazo de fetch() para la demo: devuelve un Response como el del backend. */
export async function responder(ruta: string, init: RequestInit): Promise<Response> {
  const url = new URL(ruta, location.href);
  const metodo = (init.method ?? "GET").toUpperCase();
  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = typeof init.body === "string" ? JSON.parse(init.body) : {};
  } catch {
    /* cuerpo invalido: se trata como vacio */
  }
  try {
    const datos = await manejar(metodo, url.pathname, url.searchParams, cuerpo);
    return json(200, datos);
  } catch (e) {
    if (e instanceof Http) return json(e.status, { detail: e.detail });
    throw e;
  } finally {
    guardarEstado();
  }
}

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
