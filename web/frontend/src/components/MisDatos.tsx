import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { ACCIONES, fechaHora, monto } from "../lib/format";
import type { Actividad, DatoCifrado } from "../types";
import { Icono, InfoTip, Scramble, Section } from "./ui";

const MEDIDAS = [
  { t: "En tránsito", d: "Todo viaja por HTTPS (TLS 1.2+) con un certificado de nuestra propia CA. Sin HTTPS la cookie de sesión ni siquiera se envía." },
  { t: "Contraseña", d: "Se guarda como hash Argon2id con sal única. Ni el personal de CrediFácil puede leerla." },
  { t: "Sesión", d: "Cookie HttpOnly + SameSite=Strict: JavaScript no puede leerla y otros sitios no pueden usarla. Se cierra tras 30 min sin actividad." },
  { t: "En reposo", d: "Ingreso, edad y el detalle de tu score están cifrados en la base con pgcrypto (OpenPGP simétrico, AES)." },
  { t: "Mínimo privilegio", d: "La web se conecta con un rol que no puede leer los datos en claro del pipeline ni borrar la auditoría." },
  { t: "Auditoría", d: "Cada acceso a tus datos queda registrado: quién, cuándo, desde dónde y qué. Lo ves aquí abajo." },
];

export default function MisDatos() {
  const [datos, setDatos] = useState<DatoCifrado[] | null>(null);
  const [actividad, setActividad] = useState<Actividad[]>([]);
  const [ingreso, setIngreso] = useState<number | null>(null);
  const [aviso, setAviso] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);

  const recargarActividad = useCallback(() => api.get<Actividad[]>("/api/mi/actividad").then(setActividad, () => undefined), []);
  useEffect(() => {
    api.get<DatoCifrado[]>("/api/mi/datos").then(setDatos, () => setDatos([]));
    recargarActividad();
  }, [recargarActividad]);

  async function descifrar(d: DatoCifrado) {
    if (!d.descifrable || d.id !== "ingreso") {
      try {
        await api.post("/api/mi/datos/descifrar", { campo: d.id });
      } catch (e) {
        setAviso((a) => ({ ...a, [d.id]: e instanceof ApiError ? e.message : "No disponible" }));
      }
      recargarActividad();
      return;
    }
    setCargando(true);
    try {
      const r = await api.post<{ valor: number }>("/api/mi/datos/descifrar", { campo: "ingreso" });
      setIngreso(r.valor);
    } finally {
      setCargando(false);
      recargarActividad();
    }
  }

  return (
    <Section
      id="datos"
      num="06"
      titulo="Tus datos y quién los vio"
      lead={
        <>
          Así están guardados tus datos sensibles en la base, byte por byte. Solo se descifran cuando tú lo pides, y cada vez que alguien los toca
          queda registrado.
        </>
      }
    >
      <div className="card card-pad">
        <h3 className="card-h3">
          Tus datos cifrados
          <InfoTip>
            El primer byte de cada bloque (c3…) es la cabecera OpenPGP; el cuarto indica el algoritmo: 07 = AES-128, 09 = AES-256. Sin la llave del
            servidor estos bytes no revelan nada.
          </InfoTip>
        </h3>
        <div className="datos">
          {(datos ?? []).map((d, i) => (
            <motion.div key={d.id} className="dato" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
              <div className="dato-head">
                <div>
                  <b>{d.nombre}</b>
                  <p className="mono muted" style={{ fontSize: 11.5 }}>
                    {d.ubicacion}
                  </p>
                </div>
                <span className="chip">
                  <Icono.candado size={12} /> {d.algoritmo} · {d.bytes} bytes
                </span>
              </div>
              <div className="cipher dato-cipher">
                <AnimatePresence mode="wait">
                  {d.id === "ingreso" && ingreso !== null ? (
                    <motion.span key="claro" className="dato-claro" initial={{ opacity: 0, filter: "blur(6px)" }} animate={{ opacity: 1, filter: "blur(0px)" }}>
                      <Scramble texto={monto(ingreso)} duracion={700} />
                    </motion.span>
                  ) : (
                    <motion.span key="cifrado" exit={{ opacity: 0, filter: "blur(6px)" }}>
                      <Scramble texto={d.hex.slice(0, 160)} duracion={1400} />
                      {d.hex.length > 160 && <span className="muted"> … +{(d.hex.length - 160) / 2} bytes</span>}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <div className="dato-pie">
                <p className="muted">{d.uso}</p>
                {d.id === "ingreso" ? (
                  ingreso === null ? (
                    <button className="btn btn-sm" onClick={() => descifrar(d)} disabled={cargando}>
                      <Icono.ojo size={14} /> Descifrar con mi sesión
                    </button>
                  ) : (
                    <button className="btn btn-sm" onClick={() => setIngreso(null)}>
                      <Icono.candado size={13} /> Volver a ocultar
                    </button>
                  )
                ) : d.id === "nacimiento" ? (
                  <button className="btn btn-sm" onClick={() => descifrar(d)}>
                    <Icono.candado size={13} /> Intentar descifrar
                  </button>
                ) : null}
              </div>
              {aviso[d.id] && (
                <p className="dato-aviso" role="status">
                  <Icono.alerta size={14} /> {aviso[d.id]} (el intento quedó registrado abajo)
                </p>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card card-pad">
          <h3 className="card-h3">Registro de accesos a tus datos</h3>
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 12 }}>
            Tomado en vivo de la tabla de auditoría (solo se puede agregar, nunca borrar).
          </p>
          <ol className="actividad">
            <AnimatePresence initial={false}>
              {actividad.map((a) => (
                <motion.li key={a.ts + a.accion} layout initial={{ opacity: 0, x: -12, backgroundColor: "var(--pos-wash)" }} animate={{ opacity: 1, x: 0, backgroundColor: "rgba(0,0,0,0)" }} transition={{ duration: 0.8 }}>
                  <span className={`act-dot ${a.exito ? "" : "fallo"}`} />
                  <div>
                    <b>{ACCIONES[a.accion] ?? a.accion}</b>
                    {!a.exito && <span className="chip chip-serious" style={{ height: 20, marginLeft: 8, fontSize: 11 }}>denegado</span>}
                    <p className="muted">
                      {a.quien} · {fechaHora(a.ts)} · IP {a.ip}
                    </p>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </div>
        <div className="card card-pad">
          <h3 className="card-h3">Cómo te protegemos</h3>
          <ul className="medidas">
            {MEDIDAS.map((m, i) => (
              <motion.li key={m.t} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}>
                <span className="medida-icono">
                  <Icono.escudo size={15} />
                </span>
                <div>
                  <b>{m.t}</b>
                  <p className="ink2">{m.d}</p>
                </div>
              </motion.li>
            ))}
          </ul>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
            Marco: Ley N.º 29733 de Protección de Datos Personales (Perú). Puedes pedir acceso, rectificación o cancelación de tus datos.
          </p>
        </div>
      </div>
    </Section>
  );
}
