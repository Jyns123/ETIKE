import * as d3 from "d3";
import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useAncho } from "../hooks";
import { entero, pct, signo } from "../lib/format";
import type { MiScore, Modelo, Vecino } from "../types";
import { Icono, InfoTip, posDe, Scramble, Section, Segmentado, Tooltip, type EstadoTooltip } from "./ui";

type Grupo = "todos" | "con" | "sin";

export default function Comunidad({ modelo, mi }: { modelo: Modelo; mi: MiScore }) {
  const [vecinos, setVecinos] = useState<Vecino[] | null>(null);
  const [grupo, setGrupo] = useState<Grupo>("todos");
  useEffect(() => {
    api.get<{ vecinos: Vecino[] }>("/api/comunidad").then((r) => setVecinos(r.vecinos), () => setVecinos([]));
  }, []);

  return (
    <Section
      id="comunidad"
      num="04"
      titulo="Compárate sin exponer a nadie"
      lead={
        <>
          Tu posición entre las {entero(mi.total_clientes)} solicitudes del dataset. Los demás aparecen con un <strong>alias</strong> y su ingreso
          se muestra tal como está guardado: <strong>cifrado</strong>. Nadie puede ver el tuyo tampoco.
        </>
      }
    >
      <div className="card card-pad">
        <div className="barra-controles">
          <div>
            <h3 className="card-h3">¿Dónde estás en la distribución?</h3>
            <p className="muted" style={{ fontSize: 13.5 }}>
              Cada barra agrupa 10 puntos de score. Pasa el cursor para ver cuántas personas hay y qué tan seguido se atrasaron.
            </p>
          </div>
          <Segmentado
            label="Grupo"
            valor={grupo}
            onChange={setGrupo}
            opciones={[
              { id: "todos", label: "Todos" },
              { id: "con", label: "Con historial" },
              { id: "sin", label: "Sin historial" },
            ]}
          />
        </div>
        <Histograma modelo={modelo} mi={mi} grupo={grupo} />
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card card-pad">
          <h3 className="card-h3">
            Tus vecinos de score
            <InfoTip>
              36 personas al azar con un score parecido al tuyo (±40). El alias sale de un HMAC-SHA256 con una llave del servidor: es estable pero
              no se puede revertir al ID real. Sus scores se redondean a la decena.
            </InfoTip>
          </h3>
          <p className="muted" style={{ fontSize: 13.5 }}>
            Cada punto es una persona. Rellenos: con historial en bureau. Huecos: sin historial.
          </p>
          {vecinos ? <Enjambre mi={mi} vecinos={vecinos} /> : <div style={{ height: 240 }} />}
        </div>
        <div className="card card-pad">
          <h3 className="card-h3">Tus pilares frente a otros</h3>
          <p className="muted" style={{ fontSize: 13.5 }}>
            Puntos que aporta cada pilar: tú, la mediana de las personas aptas y la de tu grupo ({mi.tiene_historial ? "con" : "sin"} historial).
          </p>
          <Mancuernas modelo={modelo} mi={mi} />
        </div>
      </div>

      <Boveda vecinos={vecinos} />
    </Section>
  );
}

/* ------------------------------------------------------------------ Histograma */

function Histograma({ modelo, mi, grupo }: { modelo: Modelo; mi: MiScore; grupo: Grupo }) {
  const [ref, w] = useAncho<HTMLDivElement>();
  const visto = useInView(ref, { once: true, margin: "-60px" });
  const [tt, setTt] = useState<EstadoTooltip | null>(null);
  const [activa, setActiva] = useState<number | null>(null);
  const [vistaTabla, setVistaTabla] = useState(false);
  const H = 280;
  const m = { t: 28, r: 12, b: 34, l: 48 };
  const datos = modelo.distribucion.map((d) => ({
    ...d,
    valor: grupo === "todos" ? d.n : grupo === "con" ? d.n_con_historial : d.n - d.n_con_historial,
  }));
  const x = d3.scaleLinear([d3.min(datos, (d) => d.desde)!, d3.max(datos, (d) => d.desde + 10)!], [m.l, Math.max(m.l + 50, w - m.r)]);
  const y = d3.scaleLinear([0, d3.max(datos, (d) => d.valor)! * 1.08], [H - m.b, m.t]).nice();
  const bw = Math.max(1, x(10) - x(0) - 2);
  const total = d3.sum(datos, (d) => d.valor);
  // en "Todos" se usa el percentil exacto del servidor; por grupo, la aproximacion por cubetas
  const debajo = grupo === "todos" ? mi.percentil * total : d3.sum(datos.filter((d) => d.desde + 10 <= mi.score), (d) => d.valor);
  const izquierda = mi.score < modelo.umbral_apto;

  return (
    <div ref={ref}>
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label={`Distribución de scores. Tu score ${mi.score} supera al ${pct(debajo / total)} del grupo.`}>
          {y.ticks(4).map((t) => (
            <g key={t}>
              <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text x={m.l - 8} y={y(t) + 4} textAnchor="end" className="chart-muted tabular">
                {d3.format("~s")(t)}
              </text>
            </g>
          ))}
          {datos.map((d, i) => {
            const alto = H - m.b - y(d.valor);
            return (
              <motion.rect
                key={d.desde}
                x={x(d.desde) + 1}
                width={bw}
                rx={Math.min(4, bw / 2)}
                fill={d.desde >= modelo.umbral_apto ? "var(--pos)" : "var(--axis)"}
                initial={{ y: H - m.b, height: 0 }}
                animate={visto ? { y: y(d.valor), height: Math.max(0, alto) } : {}}
                transition={{ duration: 0.7, delay: i * 0.012, ease: [0.2, 0.8, 0.2, 1] }}
                opacity={activa !== null && activa !== d.desde ? 0.55 : 1}
                onPointerMove={(e) => {
                  setActiva(d.desde);
                  setTt({
                    ...posDe(e),
                    contenido: (
                      <>
                        <strong>{entero(d.valor)}</strong>
                        <span className="tt-label">personas con score {d.desde}–{d.desde + 9}</span>
                        <div className="tt-row">
                          <span>Se atrasaron</span>
                          <b>{pct(d.tasa_default, 1)}</b>
                        </div>
                      </>
                    ),
                  });
                }}
                onPointerLeave={() => (setActiva(null), setTt(null))}
              />
            );
          })}
          <line x1={m.l} x2={w - m.r} y1={H - m.b} y2={H - m.b} stroke="var(--axis)" />
          {x.ticks(8).map((t) => (
            <text key={t} x={x(t)} y={H - m.b + 18} textAnchor="middle" className="chart-muted tabular">
              {t}
            </text>
          ))}
          <line x1={x(modelo.umbral_apto)} x2={x(modelo.umbral_apto)} y1={m.t - 6} y2={H - m.b} stroke="var(--ink-2)" strokeWidth={1} />
          <text x={x(modelo.umbral_apto) + (izquierda ? 6 : -6)} y={m.t - 12} textAnchor={izquierda ? "start" : "end"} className="chart-text">
            apto desde {modelo.umbral_apto}
          </text>
          <motion.g initial={{ opacity: 0, y: -10 }} animate={visto ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.9, type: "spring" }}>
            <line x1={x(mi.score)} x2={x(mi.score)} y1={m.t + 10} y2={H - m.b} stroke="var(--ink)" strokeWidth={2} />
            <circle cx={x(mi.score)} cy={m.t + 10} r={6} fill="var(--ink)" stroke="var(--surface)" strokeWidth={2} />
            <text x={x(mi.score) + (izquierda ? -12 : 12)} y={m.t + 14} textAnchor={izquierda ? "end" : "start"} className="chart-strong" style={{ fontSize: 13 }}>
              Tú · {mi.score} · superas al {pct(debajo / total)}
            </text>
          </motion.g>
        </svg>
      )}
      <div className="barra-controles" style={{ marginTop: 8 }}>
        <div className="legend">
          <span>
            <i className="key" style={{ background: "var(--pos)" }} /> Score apto
          </span>
          <span>
            <i className="key" style={{ background: "var(--axis)" }} /> Aún no apto
          </span>
          <span>
            <i className="key-line" style={{ background: "var(--ink)" }} /> Tú
          </span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setVistaTabla((v) => !v)} aria-expanded={vistaTabla}>
          {vistaTabla ? "Ocultar tabla" : "Ver como tabla"}
        </button>
      </div>
      {vistaTabla && (
        <div className="table-wrap" style={{ maxHeight: 280, overflowY: "auto" }}>
          <table className="data">
            <thead>
              <tr>
                <th>Score</th>
                <th className="num">Personas</th>
                <th className="num">Se atrasaron</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((d) => (
                <tr key={d.desde}>
                  <td>
                    {d.desde}–{d.desde + 9}
                  </td>
                  <td className="num">{entero(d.valor)}</td>
                  <td className="num">{pct(d.tasa_default, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Tooltip estado={tt} />
    </div>
  );
}

/* ------------------------------------------------------------------ Enjambre */

function Enjambre({ mi, vecinos }: { mi: MiScore; vecinos: Vecino[] }) {
  const [ref, w] = useAncho<HTMLDivElement>();
  const [tt, setTt] = useState<EstadoTooltip | null>(null);
  const [activo, setActivo] = useState<number | null>(null);
  const H = 240;
  const r = 6;
  const x = d3.scaleLinear([mi.score - 48, mi.score + 48], [20, Math.max(60, w - 20)]);
  const nodos = useMemo(() => {
    const ns = [
      ...vecinos.map((v) => ({ x: x(v.score_aprox), y: H / 2, fx: undefined as number | undefined, v })),
      { x: x(mi.score), y: H / 2, fx: x(mi.score), v: null as Vecino | null },
    ];
    const sim = d3
      .forceSimulation(ns as d3.SimulationNodeDatum[])
      .force("x", d3.forceX<(typeof ns)[number]>((d) => (d.v ? x(d.v.score_aprox) : x(mi.score))).strength(0.9))
      .force("y", d3.forceY(H / 2 - 10).strength(0.06))
      .force("c", d3.forceCollide(r + 2.5))
      .stop();
    for (let i = 0; i < 220; i++) sim.tick();
    return ns as ((typeof ns)[number] & { x: number; y: number })[];
  }, [vecinos, w, mi.score]);
  const delaunay = useMemo(() => d3.Delaunay.from(nodos, (d) => d.x, (d) => d.y), [nodos]);

  const mover = (e: React.PointerEvent<SVGSVGElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const i = delaunay.find(e.clientX - b.left, e.clientY - b.top);
    const n = nodos[i];
    if (!n || Math.hypot(n.x - (e.clientX - b.left), n.y - (e.clientY - b.top)) > 28) return (setActivo(null), setTt(null));
    setActivo(i);
    setTt({
      ...posDe(e),
      contenido: n.v ? (
        <>
          <strong>≈ {n.v.score_aprox}</strong>
          <span className="tt-label mono">{n.v.alias}</span>
          <div className="tt-row">
            <span>Historial</span>
            <b>{n.v.tiene_historial ? "Con historial" : "Sin historial"}</b>
          </div>
          <div className="tt-row">
            <span>Ingreso</span>
            <b>
              <Icono.candado size={11} /> cifrado ({n.v.algoritmo})
            </b>
          </div>
        </>
      ) : (
        <>
          <strong>{mi.score}</strong>
          <span className="tt-label">Tú ({mi.alias})</span>
        </>
      ),
    });
  };

  return (
    <div ref={ref} className="enjambre">
      {w > 0 && (
        <svg width={w} height={H} onPointerMove={mover} onPointerLeave={() => (setActivo(null), setTt(null))} role="img" aria-label={`${vecinos.length} personas con score cercano al tuyo`}>
          {x.ticks(6).map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={10} y2={H - 26} stroke="var(--grid)" />
              <text x={x(t)} y={H - 8} textAnchor="middle" className="chart-muted tabular">
                {t}
              </text>
            </g>
          ))}
          {nodos.map((n, i) =>
            n.v ? (
              <motion.circle
                key={n.v.alias}
                cx={n.x}
                cy={n.y}
                r={activo === i ? r + 2 : r}
                fill={n.v.tiene_historial ? "var(--pos)" : "var(--surface)"}
                stroke={n.v.tiene_historial ? "var(--surface)" : "var(--pos)"}
                strokeWidth={2}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + i * 0.02, type: "spring", bounce: 0.4 }}
              />
            ) : (
              <g key="yo">
                <motion.circle cx={n.x} cy={n.y} r={r + 4} fill="var(--ink)" stroke="var(--surface)" strokeWidth={2.5} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.9, type: "spring", bounce: 0.5 }} />
                <text x={n.x} y={n.y - 16} textAnchor="middle" className="chart-strong" style={{ fontSize: 12 }}>
                  Tú
                </text>
              </g>
            ),
          )}
        </svg>
      )}
      <Tooltip estado={tt} />
    </div>
  );
}

/* ------------------------------------------------------------------ Mancuernas */

function Mancuernas({ modelo, mi }: { modelo: Modelo; mi: MiScore }) {
  const [ref, w] = useAncho<HTMLDivElement>();
  const grupoRef = modelo.referencia_pilares[mi.tiene_historial ? "con_historial" : "sin_historial"];
  const aptos = modelo.referencia_pilares.aptos;
  const filas = modelo.pilares.map((p) => ({ p, tu: mi.pilares[p.id], aptos: aptos[p.id], grupo: grupoRef[p.id] }));
  const todos = filas.flatMap((f) => [f.tu, f.aptos, f.grupo, 0]);
  const x = d3.scaleLinear([d3.min(todos)! - 6, d3.max(todos)! + 6], [8, Math.max(40, w - 8)]).nice();
  const filaH = 62;
  return (
    <div ref={ref}>
      {w > 0 && (
        <svg width={w} height={filas.length * filaH + 24} role="img" aria-label="Comparación de pilares">
          <line x1={x(0)} x2={x(0)} y1={0} y2={filas.length * filaH} stroke="var(--axis)" />
          {filas.map((f, i) => {
            const cy = i * filaH + 36;
            const brecha = f.tu - f.aptos;
            return (
              <g key={f.p.id}>
                <text x={0} y={cy - 18} className="chart-text" style={{ fill: "var(--ink)", fontWeight: 600 }}>
                  {f.p.nombre}
                </text>
                <text x={w} y={cy - 18} textAnchor="end" className="chart-muted">
                  {brecha >= 0 ? `${signo(Math.round(brecha))} sobre aptos` : `${signo(Math.round(brecha))} bajo aptos`}
                </text>
                <line x1={x(Math.min(f.tu, f.aptos, f.grupo))} x2={x(Math.max(f.tu, f.aptos, f.grupo))} y1={cy} y2={cy} stroke="var(--grid)" strokeWidth={4} strokeLinecap="round" />
                <circle cx={x(f.grupo)} cy={cy} r={6} fill="var(--surface)" stroke="var(--muted)" strokeWidth={2} />
                <circle cx={x(f.aptos)} cy={cy} r={6} fill="var(--pos)" stroke="var(--surface)" strokeWidth={2} />
                <motion.circle cy={cy} r={7} fill="var(--ink)" stroke="var(--surface)" strokeWidth={2} initial={{ cx: x(0) }} whileInView={{ cx: x(f.tu) }} viewport={{ once: true }} transition={{ delay: 0.2 + i * 0.15, type: "spring", bounce: 0.3 }} />
              </g>
            );
          })}
          {x.ticks(5).map((t) => (
            <text key={t} x={x(t)} y={filas.length * filaH + 18} textAnchor="middle" className="chart-muted tabular">
              {signo(t)}
            </text>
          ))}
        </svg>
      )}
      <div className="legend" style={{ marginTop: 6 }}>
        <span>
          <i className="key" style={{ background: "var(--ink)", borderRadius: "50%" }} /> Tú
        </span>
        <span>
          <i className="key" style={{ background: "var(--pos)", borderRadius: "50%" }} /> Mediana aptos
        </span>
        <span>
          <i className="key" style={{ border: "2px solid var(--muted)", borderRadius: "50%" }} /> Mediana {mi.tiene_historial ? "con" : "sin"} historial
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Boveda */

function Boveda({ vecinos }: { vecinos: Vecino[] | null }) {
  const [todos, setTodos] = useState(false);
  const [denegado, setDenegado] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const visto = useInView(ref, { once: true, margin: "-60px" });
  const lista = (vecinos ?? []).slice(0, todos ? 36 : 12);
  return (
    <div ref={ref} className="card card-pad" style={{ marginTop: 16 }}>
      <div className="barra-controles">
        <div>
          <h3 className="card-h3">Así ves los datos de los demás</h3>
          <p className="muted" style={{ fontSize: 13.5, maxWidth: "70ch" }}>
            Este es el ingreso de cada vecino exactamente como está en la base de datos: bytes cifrados con pgcrypto. La app no tiene ninguna ruta
            para descifrar datos de otra persona, ni siquiera para el personal interno.
          </p>
        </div>
      </div>
      <div className="vecinos">
        {lista.map((v, i) => (
          <motion.div
            key={v.alias}
            className={`vecino ${denegado === v.alias ? "shake" : ""}`}
            initial={{ opacity: 0, y: 10 }}
            animate={visto ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: (i % 12) * 0.04 }}
          >
            <div className="vecino-top">
              <span className="mono vecino-alias">{v.alias}</span>
              <span className="vecino-score tabular">≈{v.score_aprox}</span>
            </div>
            <div className="vecino-meta">
              <span className={`punto ${v.tiene_historial ? "lleno" : ""}`} />
              {v.tiene_historial ? "Con historial" : "Sin historial"}
              <span className="chip" style={{ height: 20, fontSize: 11, marginLeft: "auto" }}>
                {v.algoritmo}
              </span>
            </div>
            <div className="cipher cipher-fade">{visto && <Scramble texto={v.ingreso_cifrado} duracion={1200 + (i % 12) * 90} />}</div>
            <button type="button" className="vecino-btn" onClick={() => (setDenegado(v.alias), setTimeout(() => setDenegado(null), 2600))}>
              <Icono.candado size={12} /> Intentar descifrar
            </button>
            <AnimatePresence>
              {denegado === v.alias && (
                <motion.p className="vecino-denegado" role="status" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  Acceso denegado: solo {v.alias} puede ver su ingreso.
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
      {vecinos && vecinos.length > 12 && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button className="btn btn-sm" onClick={() => setTodos((t) => !t)}>
            {todos ? "Ver menos" : `Ver los ${vecinos.length}`}
          </button>
        </div>
      )}
    </div>
  );
}
