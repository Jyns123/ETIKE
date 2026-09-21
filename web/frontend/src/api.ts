// Cliente HTTP minimo. La sesion viaja en una cookie HttpOnly que JS no puede
// leer: aqui no se guarda ningun token (nada en localStorage).

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Oyente = () => void;
const alActividad = new Set<Oyente>();
const alExpirar = new Set<Oyente>();

/** Cada respuesta OK reinicia el contador de inactividad del servidor. */
export const onActividad = (f: Oyente) => (alActividad.add(f), () => void alActividad.delete(f));
/** 401 en cualquier llamada = la sesion ya no es valida. */
export const onExpirar = (f: Oyente) => (alExpirar.add(f), () => void alExpirar.delete(f));

async function req<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(ruta, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...init,
  });
  if (!r.ok) {
    const cuerpo = await r.json().catch(() => ({}));
    if (r.status === 401 && !ruta.endsWith("/login")) alExpirar.forEach((f) => f());
    throw new ApiError(r.status, typeof cuerpo.detail === "string" ? cuerpo.detail : "Algo salió mal");
  }
  alActividad.forEach((f) => f());
  return r.json() as Promise<T>;
}

export const api = {
  get: <T>(ruta: string) => req<T>(ruta),
  post: <T>(ruta: string, cuerpo?: unknown) =>
    req<T>(ruta, { method: "POST", body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) }),
};
