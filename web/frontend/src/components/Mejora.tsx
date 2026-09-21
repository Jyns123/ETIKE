import * as d3 from "d3";
import { AnimatePresence, motion, useSpring, useTransform } from "motion/react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { HORIZONTE, monto, pct, signo, valorFactor, anios } from "../lib/format";
import { bandaDe, escenarioInicial, simular, type Escenario } from "../lib/scorecard";
import type { MiScore, Modelo, Sugerencia } from "../types";
import { Icono, InfoTip, Section } from "./ui";

export default function Mejora(props: { modelo: Modelo; mi: MiScore; escenario: Escenario; setEscenario: (e: Escenario) => void }) {
  const { modelo, mi } = props;
  const simRef = useRef<HTMLDivElement>(null);
  const siguiente = modelo.bandas.find((b) => b.desde > mi.score && b.desde >= modelo.umbral_apto);

  const probar = (s: Sugerencia) => {
    const e = escenarioInicial(mi);
    for (const [k, v] of Object.entries(s.cambios)) {
      if (k === "monto") e.monto = v;
      else if (k === "cuotas") e.cuotas = v;
      else e.valores[k] = v;
    }
    props.setEscenario(e);
    simRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Section
      id="mejora"
      num="03"
      titulo="Cómo mejorar tu score"
      lead={
        <>
          Como tu score es una suma, podemos calcular <strong>exactamente</strong> cuánto sube con cada cambio. Estas sugerencias salen de
          tus propios datos; pruébalas en el simulador antes de decidir.
        </>
      }
    >
      {!mi.apto && mi.plan && <Plan modelo={modelo} mi={mi} />}
      {mi.apto && siguiente && (
        <div className="card card-pad aviso-apto">
          <span className="chip chip-good">
            <Icono.check size={14} /> Ya eres apto
          </span>
          <p>
            Te faltan <strong>{siguiente.desde - mi.score} puntos</strong> para la banda <strong>{siguiente.nombre}</strong> ({siguiente.desde}+),
            que suele traer mejores condiciones.
          </p>
        </div>
      )}
      {!mi.tiene_historial && (
        <div className="nota-neutral card card-pad" style={{ marginBottom: 16 }}>
          <Icono.escudo size={18} />
          <p>
            <b>No tienes historial en otras entidades y eso no te resta.</b> Los factores que dependen del bureau (antigüedad, uso de deuda,
            créditos activos, atrasos) valen 0 por política: te evaluamos por tu capacidad de pago y tu estabilidad, justamente para que
            puedas acceder a crédito sin historial previo.
          </p>
        </div>
      )}

      <div className="sugerencias">
        {mi.sugerencias.length === 0 && <p className="card card-pad ink2">Ya estás en el mejor tramo de todos los factores que dependen de ti.</p>}
        {mi.sugerencias.map((s, i) => (
          <motion.article
            key={s.id}
            className={`card sug ${s.cruza_umbral ? "cruza" : ""} ${mi.plan?.pasos.includes(s.id) ? "en-plan" : ""}`}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: (i % 3) * 0.08, duration: 0.5 }}
          >
            <div className="sug-top">
              <span className="ganancia" aria-label={`Sube ${s.ganancia} puntos`}>
                +{s.ganancia}
                <small>pts</small>
              </span>
              <span className={`chip horizonte-${s.horizonte}`}>{HORIZONTE[s.horizonte]}</span>
            </div>
            <h3>{s.titulo}</h3>
            <p className="ink2">{s.detalle}</p>
            <div className="sug-pie">
              <span className="muted tabular">
                {mi.score} → <b className="ink2">{s.nuevo_score}</b>
                {s.cruza_umbral && (
                  <span className="txt-good">
                    {" "}
                    <Icono.check size={13} /> serías apto
                  </span>
                )}
              </span>
              <button className="btn btn-sm" onClick={() => probar(s)}>
                Probar <Icono.flecha size={13} />
              </button>
            </div>
          </motion.article>
        ))}
      </div>

      <div ref={simRef} style={{ scrollMarginTop: 90 }}>
        <Simulador modelo={modelo} mi={mi} escenario={props.escenario} setEscenario={props.setEscenario} />
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ Plan */

function Plan({ modelo, mi }: { modelo: Modelo; mi: MiScore }) {
  const plan = mi.plan!;
  const pasos = plan.pasos.map((id) => mi.sugerencias.find((s) => s.id === id)!).filter(Boolean);
  let acumulado = mi.score;
  return (
    <div className="card card-pad plan">
      <div className="plan-head">
        <div>
          <p className="eyebrow">Tu camino para ser apto</p>
          <h3>
            {plan.alcanzable
              ? `${pasos.length === 1 ? "Un cambio" : `${pasos.length} cambios`} y llegas a ${plan.score_final}`
              : `Con todo lo posible llegarías a ${plan.score_final}`}
          </h3>
        </div>
        <span className="chip">Faltan {plan.faltan} pts</span>
      </div>
      <ol className="plan-pasos">
        <li className="plan-nodo">
          <span className="plan-score">{mi.score}</span>
          <span className="muted">Hoy</span>
        </li>
        {pasos.map((s, i) => {
          acumulado += s.ganancia;
          const llega = acumulado >= modelo.umbral_apto;
          return (
            <motion.li
              key={s.id}
              className="plan-nodo"
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.25 + i * 0.25 }}
            >
              <span className="plan-flecha">+{s.ganancia}</span>
              <span className={`plan-score ${llega ? "ok" : ""}`}>
                {acumulado}
                {llega && <Icono.check size={16} />}
              </span>
              <span className="plan-texto">{s.titulo}</span>
            </motion.li>
          );
        })}
      </ol>
      {!plan.alcanzable && (
        <p className="ink2" style={{ marginTop: 12 }}>
          Las acciones inmediatas no alcanzan todavía: la estabilidad y el historial suman con el tiempo. Vuelve a revisar tu score en unos
          meses.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Simulador */

function Simulador(props: { modelo: Modelo; mi: MiScore; escenario: Escenario; setEscenario: (e: Escenario) => void }) {
  const { modelo, mi, escenario: e, setEscenario } = props;
  const inicial = useMemo(() => escenarioInicial(mi), [mi]);
  const base = useMemo(() => simular(modelo, mi, inicial), [modelo, mi, inicial]);
  const sim = useMemo(() => simular(modelo, mi, e), [modelo, mi, e]);
  const F = Object.fromEntries(modelo.factores.map((f) => [f.id, f]));
  const delta = sim.score - mi.score;
  const apto = sim.score >= modelo.umbral_apto;
  const cambiados = modelo.factores.filter((f) => sim.puntos[f.id] !== base.puntos[f.id]);
  const sol = mi.solicitud;
  const set = (parcial: Partial<Escenario>) => setEscenario({ ...e, ...parcial });
  const setV = (id: string, v: number | null) => setEscenario({ ...e, valores: { ...e.valores, [id]: v } });
  const cuota = e.cuotas > 0 ? e.monto / e.cuotas : 0;
  const modificado = JSON.stringify(e) !== JSON.stringify(inicial);

  return (
    <div className="card simulador">
      <div className="sim-controles">
        <div className="sim-head">
          <div>
            <p className="eyebrow">Simulador</p>
            <h3>¿Qué pasaría si…?</h3>
          </div>
          <button className="btn btn-sm" onClick={() => setEscenario(inicial)} disabled={!modificado}>
            Restablecer
          </button>
        </div>

        {sol.monto_credito && sol.anualidad && (
          <>
            <Control
              titulo="Monto que pides"
              valor={monto(e.monto)}
              nota={`${e.monto >= inicial.monto ? "+" : "−"}${pct(Math.abs(e.monto / inicial.monto - 1))} vs. tu solicitud`}
              min={Math.round(inicial.monto * 0.4)}
              max={Math.round(inicial.monto * 1.3)}
              step={Math.max(1, Math.round(inicial.monto / 200))}
              actual={e.monto}
              onChange={(v) => set({ monto: v })}
              info="Pedir menos baja la cuota y lo que financias por encima del precio del bien: mueve dos factores a la vez."
            />
            <Control
              titulo="Número de cuotas"
              valor={`${e.cuotas.toFixed(1)} cuotas`}
              nota={`Cuota: ${monto(cuota)}${sol.ingreso ? ` · ${pct(cuota / sol.ingreso)} de tu ingreso` : ""}`}
              min={Math.max(4, Math.floor(inicial.cuotas * 0.5))}
              max={Math.ceil(inicial.cuotas * 2)}
              step={0.5}
              actual={e.cuotas}
              onChange={(v) => set({ cuotas: v })}
              info="Más cuotas = cuota más baja por pago. Solo cambia el factor «Cuota vs. ingreso» (pagarías más intereses en total)."
            />
          </>
        )}
        {inicial.valores.anios_empleo != null && (
          <Control
            titulo="Años en tu empleo"
            valor={anios(e.valores.anios_empleo ?? 0)}
            nota={`${signo(Math.round(((e.valores.anios_empleo ?? 0) - (inicial.valores.anios_empleo ?? 0)) * 10) / 10)} años desde hoy`}
            min={inicial.valores.anios_empleo!}
            max={inicial.valores.anios_empleo! + 10}
            step={0.25}
            actual={e.valores.anios_empleo ?? 0}
            onChange={(v) => setV("anios_empleo", v)}
          />
        )}
        <Control
          titulo="Antigüedad de tu número"
          valor={anios(e.valores.anios_telefono ?? 0)}
          min={inicial.valores.anios_telefono ?? 0}
          max={(inicial.valores.anios_telefono ?? 0) + 6}
          step={0.25}
          actual={e.valores.anios_telefono ?? 0}
          onChange={(v) => setV("anios_telefono", v)}
        />
        {mi.tiene_historial && (
          <>
            <Control
              titulo="Uso de tus créditos activos"
              valor={pct(e.valores.uso_deuda ?? 0)}
              min={0}
              max={1.2}
              step={0.01}
              actual={e.valores.uso_deuda ?? 0}
              onChange={(v) => setV("uso_deuda", v)}
            />
            <Control
              titulo="Créditos activos en otras entidades"
              valor={String(e.valores.creditos_activos ?? 0)}
              min={0}
              max={Math.max(8, inicial.valores.creditos_activos ?? 0)}
              step={1}
              actual={e.valores.creditos_activos ?? 0}
              onChange={(v) => setV("creditos_activos", v)}
            />
            <div className="control control-switch">
              <div>
                <b>Atraso vigente en otra entidad</b>
                <p className="muted">{e.valores.atraso_actual ? "Tienes un atraso" : "Todo al día"}</p>
              </div>
              <button
                role="switch"
                aria-checked={!!e.valores.atraso_actual}
                aria-label="Atraso vigente"
                className="switch"
                onClick={() => setV("atraso_actual", e.valores.atraso_actual ? 0 : 1)}
              />
            </div>
          </>
        )}
      </div>

      <div className="sim-resultado" aria-live="polite">
        <p className="eyebrow">Tu score simulado</p>
        <div className="sim-num">
          <NumeroVivo valor={sim.score} />
          <AnimatePresence mode="popLayout">
            {delta !== 0 && (
              <motion.span
                key={delta}
                className={`sim-delta ${delta > 0 ? "pos" : "neg"}`}
                initial={{ opacity: 0, y: 8, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
              >
                {signo(delta)}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <motion.div key={String(apto)} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", bounce: 0.5 }}>
          {apto ? (
            <span className="chip chip-good">
              <Icono.check size={14} /> Apto{bandaDe(modelo, sim.score).id !== "apto" ? ` · ${bandaDe(modelo, sim.score).nombre}` : " para crédito"}
            </span>
          ) : (
            <span className="chip chip-serious">
              <Icono.alerta size={14} /> Faltan {modelo.umbral_apto - sim.score} pts
            </span>
          )}
        </motion.div>
        <Regla modelo={modelo} original={mi.score} simulado={sim.score} />

        <p className="eyebrow" style={{ marginTop: 22 }}>
          Qué cambió
        </p>
        <ul className="sim-cambios">
          <AnimatePresence initial={false}>
            {cambiados.length === 0 && (
              <motion.li key="nada" className="muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                Mueve un control para ver el efecto en cada factor.
              </motion.li>
            )}
            {cambiados.map((f) => {
              const d = sim.puntos[f.id] - base.puntos[f.id];
              return (
                <motion.li key={f.id} layout initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                  <span>
                    <i className="key" style={{ background: d > 0 ? "var(--pos)" : "var(--neg)" }} /> {F[f.id].nombre}
                    <small className="muted"> · {valorFactor(f, sim.valores[f.id])}</small>
                  </span>
                  <b className="tabular">
                    {signo(base.puntos[f.id])} → {signo(sim.puntos[f.id])}
                  </b>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}

function Control(props: {
  titulo: string;
  valor: string;
  nota?: string;
  min: number;
  max: number;
  step: number;
  actual: number;
  onChange: (v: number) => void;
  info?: ReactNode;
}) {
  const fill = ((props.actual - props.min) / (props.max - props.min || 1)) * 100;
  return (
    <label className="control">
      <div className="control-top">
        <b>
          {props.titulo}
          {props.info && <InfoTip>{props.info}</InfoTip>}
        </b>
        <span className="tabular">{props.valor}</span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={Math.min(props.max, Math.max(props.min, props.actual))}
        onChange={(ev) => props.onChange(Number(ev.target.value))}
        style={{ ["--fill" as string]: `${Math.max(0, Math.min(100, fill))}%` }}
      />
      {props.nota && <small className="muted">{props.nota}</small>}
    </label>
  );
}

function NumeroVivo({ valor }: { valor: number }) {
  const mv = useSpring(valor, { stiffness: 180, damping: 24 });
  const txt = useTransform(mv, (v) => Math.round(v));
  useEffect(() => mv.set(valor), [mv, valor]);
  return <motion.span className="sim-score">{txt}</motion.span>;
}

function Regla({ modelo, original, simulado }: { modelo: Modelo; original: number; simulado: number }) {
  const x = d3.scaleLinear([modelo.escala.min + 100, modelo.escala.max - 50], [0, 100]).clamp(true);
  return (
    <div className="regla" aria-hidden="true">
      <div className="regla-track">
        <span className="regla-umbral" style={{ left: `${x(modelo.umbral_apto)}%` }}>
          <em>apto {modelo.umbral_apto}</em>
        </span>
        <span className="regla-orig" style={{ left: `${x(original)}%` }} title="Hoy" />
        <motion.span className="regla-sim" animate={{ left: `${x(simulado)}%` }} transition={{ type: "spring", stiffness: 200, damping: 24 }} />
      </div>
      <div className="regla-leyenda muted">
        <span>
          <i className="regla-orig-key" /> hoy {original}
        </span>
        <span>
          <i className="regla-sim-key" /> simulado
        </span>
      </div>
    </div>
  );
}
