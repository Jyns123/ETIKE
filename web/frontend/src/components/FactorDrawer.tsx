import * as d3 from "d3";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { entero, HORIZONTE, pct, signo, valorFactor } from "../lib/format";
import type { MiScore, Modelo, Tramo, TramoNulo } from "../types";
import { Icono } from "./ui";

/** Panel lateral con todos los tramos de un factor: cuantos puntos vale cada
 *  uno, que tan seguido se atrasaron las personas de ese tramo, y donde estas tu. */
export default function FactorDrawer(props: { modelo: Modelo; mi: MiScore; factorId: string | null; onCerrar: () => void }) {
  const { modelo, mi, factorId, onCerrar } = props;
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const f = modelo.factores.find((x) => x.id === factorId);
  const mio = mi.factores.find((x) => x.id === factorId);

  useEffect(() => {
    if (!factorId) return;
    const previo = document.activeElement as HTMLElement | null;
    cerrarRef.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", tecla);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = "";
      previo?.focus();
    };
  }, [factorId, onCerrar]);

  const filas: { t: Tramo | TramoNulo; idx: number }[] = f ? f.tramos.map((t, i) => ({ t, idx: i })) : [];
  if (f?.nulo) filas.push({ t: f.nulo, idx: -1 });
  const maxAbs = Math.max(8, ...filas.map((r) => Math.abs(r.t.puntos)));
  const sugs = mi.sugerencias.filter((s) => f && s.factores.includes(f.id));
  const pilar = modelo.pilares.find((p) => p.id === f?.pilar);

  return (
    <AnimatePresence>
      {f && mio && (
        <>
          <motion.div className="overlay" onClick={onCerrar} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-t"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", bounce: 0, duration: 0.45 }}
          >
            <div className="drawer-head">
              <div>
                <p className="eyebrow">{pilar?.nombre}</p>
                <h3 id="drawer-t">{f.nombre}</h3>
              </div>
              <button ref={cerrarRef} className="btn btn-ghost icon-btn" onClick={onCerrar} aria-label="Cerrar detalle">
                ✕
              </button>
            </div>
            <div className="drawer-body">
              <p className="ink2">{f.descripcion}</p>

              <div className="drawer-tuyo">
                <div>
                  <p className="eyebrow">Tu valor</p>
                  <p className="drawer-big">{valorFactor(f, mio.valor)}</p>
                </div>
                <div>
                  <p className="eyebrow">Te aporta</p>
                  <p className="drawer-big">{signo(mio.puntos)} pts</p>
                </div>
              </div>

              <h4 className="drawer-h4">Todos los tramos de este factor</h4>
              <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                Los puntos salen de lo que pasó en {entero(modelo.n_entrenamiento)} solicitudes reales: los tramos donde menos personas se
                atrasaron valen más.
              </p>
              <div className="escalera" role="table" aria-label={`Tramos de ${f.nombre}`}>
                <div className="escalera-fila escalera-cab" role="row">
                  <span role="columnheader">Tramo</span>
                  <span role="columnheader">Puntos</span>
                  <span role="columnheader" className="num">
                    Se atrasaron
                  </span>
                </div>
                {filas.map(({ t, idx }, k) => {
                  const tuyo = idx === mio.tramo;
                  const neutral = "neutral" in t && t.neutral;
                  const x = d3.scaleLinear([-maxAbs, maxAbs], [0, 100]);
                  return (
                    <motion.div
                      key={k}
                      role="row"
                      className={`escalera-fila ${tuyo ? "tuyo" : ""}`}
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + k * 0.05 }}
                    >
                      <span role="cell" className="escalera-label">
                        {t.etiqueta}
                        {tuyo && <b className="tu-marca">Tú</b>}
                        {neutral && <small className="muted"> · neutral por política</small>}
                      </span>
                      <span role="cell" className="escalera-barra" aria-label={`${signo(t.puntos)} puntos`}>
                        <span className="escalera-cero" />
                        {t.puntos !== 0 && (
                          <motion.i
                            style={{
                              left: `${Math.min(x(0), x(t.puntos))}%`,
                              background: t.puntos > 0 ? "var(--pos)" : "var(--neg)",
                            }}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.abs(x(t.puntos) - x(0))}%` }}
                            transition={{ delay: 0.3 + k * 0.05, duration: 0.5 }}
                          />
                        )}
                        <em style={{ left: t.puntos >= 0 ? `calc(${x(t.puntos)}% + 6px)` : undefined, right: t.puntos < 0 ? `calc(${100 - x(t.puntos)}% + 6px)` : undefined }}>
                          {signo(t.puntos)}
                        </em>
                      </span>
                      <span role="cell" className="num tabular ink2">
                        {pct(t.tasa_default, 1)}
                        <small className="muted"> de {entero(t.n)}</small>
                      </span>
                    </motion.div>
                  );
                })}
              </div>

              {mio.tramo < 0 && f.nulo?.neutral && (
                <div className="nota-neutral">
                  <Icono.escudo size={16} />
                  <p>
                    No tienes este dato porque no tienes historial en otras entidades. Por política de CrediFácil eso <b>no te resta</b>: las
                    personas sin historial se atrasan un poco más ({pct(f.nulo.tasa_default, 1)}), pero preferimos evaluarte por lo que sí
                    haces.
                  </p>
                </div>
              )}

              <h4 className="drawer-h4">Cómo mejorar este factor</h4>
              {sugs.length ? (
                sugs.map((s) => (
                  <div key={s.id} className="mini-sug">
                    <span className="ganancia">+{s.ganancia}</span>
                    <div>
                      <b>{s.titulo}</b>
                      <p className="ink2">{s.detalle}</p>
                      <span className="chip" style={{ marginTop: 6 }}>
                        {HORIZONTE[s.horizonte]}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="ink2">
                  {!f.accionable
                    ? "Este factor no depende de una acción directa tuya: mejora con el tiempo si mantienes tus pagos al día."
                    : mio.tramo === f.tramos.length - 1 || mio.puntos === Math.max(...f.tramos.map((t) => t.puntos))
                      ? "Ya estás en el mejor tramo de este factor."
                      : "No hay un cambio concreto que te haga subir de tramo ahora mismo."}
                </p>
              )}

              <p className="muted" style={{ fontSize: 12.5, marginTop: 24 }}>
                Peso del factor en el modelo: β = {f.beta.toFixed(3)}. Puede aportar entre {signo(f.rango_puntos[0])} y {signo(f.rango_puntos[1])}{" "}
                puntos.
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
