import * as d3 from "d3";
import { AnimatePresence, motion, useInView } from "motion/react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useAncho } from "../hooks";
import { pct, signo, valorFactor } from "../lib/format";
import type { Factor, MiScore, Modelo } from "../types";
import FactorDrawer from "./FactorDrawer";
import { Icono, InfoTip, posDe, Section, Segmentado, Tooltip, type EstadoTooltip } from "./ui";

interface Paso {
  f: Factor;
  valor: number | null;
  tramo: number;
  puntos: number;
  desde: number;
  hasta: number;
}

export function usePasos(modelo: Modelo, mi: MiScore) {
  return useMemo(() => {
    const porId = new Map(mi.factores.map((f) => [f.id, f]));
    let acumulado = modelo.base;
    const grupos = modelo.pilares.map((p) => {
      const pasos: Paso[] = modelo.factores
        .filter((f) => f.pilar === p.id)
        .map((f) => {
          const c = porId.get(f.id)!;
          const paso = { f, valor: c.valor, tramo: c.tramo, puntos: c.puntos, desde: acumulado, hasta: acumulado + c.puntos };
          acumulado += c.puntos;
          return paso;
        });
      return { pilar: p, pasos, total: pasos.reduce((a, s) => a + s.puntos, 0) };
    });
    return { grupos, pasos: grupos.flatMap((g) => g.pasos), final: acumulado };
  }, [modelo, mi]);
}

export default function Desglose({ modelo, mi }: { modelo: Modelo; mi: MiScore }) {
  const [hover, setHover] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [vista, setVista] = useState<"grafico" | "tabla">("grafico");
  const [paso, setPaso] = useState<number | null>(null);
  const { grupos, pasos } = usePasos(modelo, mi);

  // narracion paso a paso
  useEffect(() => {
    if (paso === null) return;
    if (paso >= pasos.length) {
      const t = setTimeout(() => setPaso(null), 2200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setPaso(paso + 1), paso < 0 ? 1200 : 1500);
    return () => clearTimeout(t);
  }, [paso, pasos.length]);

  const actual = paso !== null && paso >= 0 && paso < pasos.length ? pasos[paso] : null;

  return (
    <Section
      id="desglose"
      num="02"
      titulo="De dónde sale cada punto"
      lead={
        <>
          Tu score es una <strong>suma</strong>. Todos empiezan en {modelo.base} y cada factor suma o resta puntos según el tramo en que
          caes. Pasa el cursor por una barra para ver el detalle; haz clic para ver todos los tramos de ese factor.
        </>
      }
    >
      <div className="card card-pad">
        <div className="barra-controles">
          <div className="legend">
            <span>
              <i className="key" style={{ background: "var(--pos)" }} /> Suma puntos
            </span>
            <span>
              <i className="key" style={{ background: "var(--neg)" }} /> Resta puntos
            </span>
            <span>
              <i className="key key-neutral" /> Neutral (0)
            </span>
            <span>
              <i className="key-line" style={{ background: "var(--ink)" }} /> Umbral apto
            </span>
          </div>
          <div className="barra-controles-der">
            <button className="btn btn-sm" onClick={() => (setVista("grafico"), setPaso(-1))} disabled={paso !== null}>
              <Icono.play size={12} /> Reproducir el cálculo
            </button>
            <Segmentado
              label="Vista"
              valor={vista}
              onChange={setVista}
              opciones={[
                { id: "grafico", label: "Gráfico" },
                { id: "tabla", label: "Tabla" },
              ]}
            />
          </div>
        </div>

        <Narrador modelo={modelo} paso={paso} actual={actual} total={pasos.length} final={mi.score} />

        {vista === "grafico" ? (
          <Cascada modelo={modelo} mi={mi} grupos={grupos} hover={hover} setHover={setHover} onAbrir={setAbierto} paso={paso} />
        ) : (
          <TablaDesglose modelo={modelo} grupos={grupos} />
        )}

        <Ecuacion modelo={modelo} pasos={pasos} score={mi.score} hover={hover} setHover={setHover} onAbrir={setAbierto} />
      </div>

      <Pilares modelo={modelo} mi={mi} grupos={grupos} />

      <FactorDrawer modelo={modelo} mi={mi} factorId={abierto} onCerrar={() => setAbierto(null)} />
    </Section>
  );
}

/* ------------------------------------------------------------------ Narrador */

function Narrador(props: { modelo: Modelo; paso: number | null; actual: Paso | null; total: number; final: number }) {
  const { paso, actual } = props;
  let texto: React.ReactNode = null;
  if (paso === -1) texto = <>Empiezas en <strong>{props.modelo.base}</strong>: el puntaje de alguien exactamente promedio.</>;
  else if (actual)
    texto = (
      <>
        <strong>{actual.f.nombre}</strong>: {valorFactor(actual.f, actual.valor)} →{" "}
        {actual.puntos === 0 ? (
          <>no suma ni resta{actual.tramo < 0 && actual.f.nulo?.neutral ? " (sin historial no te penaliza)" : ""}</>
        ) : (
          <>
            <strong>{signo(actual.puntos)}</strong> puntos
          </>
        )}
        . Vas en <strong>{actual.hasta}</strong>.
      </>
    );
  else if (paso !== null && paso >= props.total)
    texto = (
      <>
        Resultado: <strong>{props.final}</strong>. {props.final >= props.modelo.umbral_apto ? "Superas el umbral de aptitud." : `Quedas a ${props.modelo.umbral_apto - props.final} puntos del umbral.`}
      </>
    );
  return (
    <AnimatePresence mode="wait">
      {texto && (
        <motion.p key={paso} className="narrador" role="status" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
          {paso !== null && paso >= 0 && paso < props.total && <span className="narrador-n">{paso + 1}/{props.total}</span>}
          {texto}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ Cascada */

function Cascada(props: {
  modelo: Modelo;
  mi: MiScore;
  grupos: ReturnType<typeof usePasos>["grupos"];
  hover: string | null;
  setHover: (id: string | null) => void;
  onAbrir: (id: string) => void;
  paso: number | null;
}) {
  const { modelo, mi, grupos, hover, setHover, onAbrir, paso } = props;
  const [ref, w] = useAncho<HTMLDivElement>();
  const visto = useInView(ref, { once: true, margin: "-80px" });
  const [tt, setTt] = useState<EstadoTooltip | null>(null);

  const angosto = w < 640;
  const labelW = angosto ? 0 : Math.min(300, w * 0.34);
  const filaH = angosto ? 58 : 40;
  const cabH = 34;
  const top = 34;

  // filas: base, (cabecera de pilar + factores)*, total
  type Fila = { tipo: "base" | "cab" | "factor" | "total"; y: number; i?: number; g?: (typeof grupos)[number]; p?: Paso };
  const filas: Fila[] = [];
  let y = top;
  filas.push({ tipo: "base", y });
  y += filaH + 12;
  let i = 0;
  for (const g of grupos) {
    filas.push({ tipo: "cab", y, g });
    y += cabH;
    for (const p of g.pasos) {
      filas.push({ tipo: "factor", y, p, i: i++ });
      y += filaH;
    }
  }
  filas.push({ tipo: "total", y });
  const H = y + filaH;

  const valores = [modelo.base, mi.score, modelo.umbral_apto, ...grupos.flatMap((g) => g.pasos.flatMap((p) => [p.desde, p.hasta]))];
  const x = d3
    .scaleLinear()
    .domain([(d3.min(valores) ?? 0) - 14, (d3.max(valores) ?? 0) + 14])
    .nice()
    .range([labelW + 8, Math.max(labelW + 60, w - (angosto ? 44 : 64))]);
  const ticks = x.ticks(angosto ? 4 : 8);
  const barH = angosto ? 14 : 18;
  const yBar = (f: Fila) => f.y + (angosto ? 30 : (filaH - barH) / 2);
  const tenue = (f: Fila) => paso !== null && f.i !== undefined && f.i > paso;

  const mostrar = (e: React.PointerEvent | React.FocusEvent, p: Paso) => {
    setHover(p.f.id);
    const t = p.tramo >= 0 ? p.f.tramos[p.tramo] : p.f.nulo;
    setTt({
      ...posDe(e),
      contenido: (
        <>
          <strong>{signo(p.puntos)} pts</strong>
          <span className="tt-label">{p.f.nombre}</span>
          <div className="tt-row">
            <span>Tu valor</span>
            <b>{valorFactor(p.f, p.valor)}</b>
          </div>
          {t && (
            <div className="tt-row">
              <span>Tu tramo</span>
              <b>{t.etiqueta}</b>
            </div>
          )}
          {t && (
            <div className="tt-row">
              <span>Atrasos en ese tramo</span>
              <b>{pct(t.tasa_default, 1)}</b>
            </div>
          )}
          <span className="muted" style={{ fontSize: 12 }}>
            Clic para ver todos los tramos
          </span>
        </>
      ),
    });
  };
  const ocultar = () => (setHover(null), setTt(null));

  return (
    <div ref={ref} className="cascada">
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label={`Cascada: parte de ${modelo.base} y termina en ${mi.score}`}>
          {/* grilla y eje */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={top - 6} y2={H - 8} stroke="var(--grid)" />
              <text x={x(t)} y={top - 14} textAnchor="middle" className="chart-muted tabular">
                {t}
              </text>
            </g>
          ))}
          {/* umbral de aptitud */}
          <line x1={x(modelo.umbral_apto)} x2={x(modelo.umbral_apto)} y1={top - 6} y2={H - 8} stroke="var(--ink)" strokeWidth={1.5} />
          <text x={x(modelo.umbral_apto) + 6} y={H - 12} className="chart-text" style={{ fontWeight: 700 }}>
            Apto {modelo.umbral_apto}
          </text>

          {filas.map((f, k) => {
            if (f.tipo === "cab") {
              return (
                <g key={k}>
                  <text x={0} y={f.y + 22} className="cascada-cab">
                    {f.g!.pilar.nombre.toUpperCase()}
                  </text>
                  <text x={angosto ? w : labelW - 12} y={f.y + 22} textAnchor="end" className="chart-text tabular" style={{ fontWeight: 700 }}>
                    {`${signo(f.g!.total)} pts`}
                  </text>
                  <line x1={0} x2={w} y1={f.y + 30} y2={f.y + 30} stroke="var(--grid)" />
                </g>
              );
            }
            if (f.tipo === "base" || f.tipo === "total") {
              const v = f.tipo === "base" ? modelo.base : mi.score;
              const yb = yBar(f);
              return (
                <g key={k}>
                  <text x={0} y={angosto ? f.y + 18 : f.y + filaH / 2 + 5} className="chart-strong" style={{ fontSize: 14 }}>
                    {f.tipo === "base" ? "Punto de partida" : "Tu score"}
                  </text>
                  {!angosto && (
                    <text x={0} y={f.y + filaH / 2 + 20} className="chart-muted">
                      {f.tipo === "base" ? "persona promedio" : mi.apto ? "apto" : "aún no apto"}
                    </text>
                  )}
                  <motion.rect
                    x={x(v) - 3}
                    y={yb - 3}
                    width={6}
                    height={barH + 6}
                    rx={3}
                    fill="var(--ink)"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: visto ? 1 : 0 }}
                    transition={{ delay: f.tipo === "base" ? 0.1 : 0.4 + grupos.flatMap((g) => g.pasos).length * 0.09 }}
                  />
                  <text x={x(v) + 10} y={yb + barH / 2 + 5} className="chart-strong tabular" style={{ fontSize: 15 }}>
                    {v}
                  </text>
                </g>
              );
            }
            const p = f.p!;
            const yb = yBar(f);
            const x0 = x(Math.min(p.desde, p.hasta));
            const ancho = Math.abs(x(p.hasta) - x(p.desde));
            const activo = hover === p.f.id;
            const siguienteY = filas[k + 1]?.tipo === "cab" ? filas[k + 2]?.y : filas[k + 1]?.y;
            return (
              <g
                key={k}
                className="cascada-fila"
                opacity={tenue(f) ? 0.14 : hover && !activo ? 0.45 : 1}
                style={{ transition: "opacity .25s" }}
                tabIndex={0}
                role="button"
                aria-label={`${p.f.nombre}: ${valorFactor(p.f, p.valor)}, ${signo(p.puntos)} puntos. Abrir detalle.`}
                onPointerMove={(e) => mostrar(e, p)}
                onPointerLeave={ocultar}
                onFocus={(e) => mostrar(e, p)}
                onBlur={ocultar}
                onClick={() => onAbrir(p.f.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onAbrir(p.f.id))}
              >
                <rect x={0} y={f.y} width={w} height={filaH} fill={activo ? "var(--surface-2)" : "transparent"} rx={8} />
                <text x={angosto ? 0 : 12} y={angosto ? f.y + 18 : f.y + filaH / 2 + 5} className="chart-text" style={{ fill: "var(--ink)", fontWeight: 600 }}>
                  {p.f.nombre}
                </text>
                {!angosto && (
                  <text x={labelW - 12} y={f.y + filaH / 2 + 5} textAnchor="end" className="chart-muted tabular">
                    {p.valor === null ? "sin dato" : valorFactor(p.f, p.valor)}
                  </text>
                )}
                {/* conector hacia la siguiente fila */}
                {siguienteY !== undefined && (
                  <line x1={x(p.hasta)} x2={x(p.hasta)} y1={yb + barH} y2={siguienteY + (angosto ? 30 : (filaH - barH) / 2)} stroke="var(--axis)" />
                )}
                {p.puntos === 0 ? (
                  <motion.path
                    d={`M${x(p.hasta)},${yb - 1} l7,${barH / 2 + 1} l-7,${barH / 2 + 1} l-7,-${barH / 2 + 1} z`}
                    fill="var(--surface)"
                    stroke="var(--muted)"
                    strokeWidth={1.5}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: visto ? 1 : 0 }}
                    transition={{ delay: 0.3 + f.i! * 0.09 }}
                  />
                ) : (
                  <motion.rect
                    x={x0}
                    y={yb}
                    width={Math.max(ancho, 2)}
                    height={barH}
                    rx={4}
                    fill={p.puntos > 0 ? "var(--pos)" : "var(--neg)"}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: visto ? 1 : 0 }}
                    style={{ originX: p.puntos > 0 ? 0 : 1 }}
                    transition={{ delay: 0.3 + f.i! * 0.09, duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
                  />
                )}
                <text
                  x={p.puntos >= 0 ? x(p.hasta) + (p.puntos === 0 ? 12 : 6) : x(p.hasta) - 6}
                  y={yb + barH / 2 + 4.5}
                  textAnchor={p.puntos >= 0 ? "start" : "end"}
                  className="chart-strong tabular"
                  style={{ fontSize: 12.5 }}
                >
                  {p.puntos === 0 ? (p.tramo < 0 && p.f.nulo?.neutral ? "0 · neutral" : "0") : signo(p.puntos)}
                </text>
              </g>
            );
          })}

          {/* cursor de la narracion */}
          {paso !== null && (
            <motion.line
              y1={top - 6}
              y2={H - 8}
              stroke="var(--ink)"
              strokeWidth={2}
              animate={{ x1: x(paso < 0 ? modelo.base : paso >= grupos.flatMap((g) => g.pasos).length ? mi.score : grupos.flatMap((g) => g.pasos)[paso].hasta), x2: x(paso < 0 ? modelo.base : paso >= grupos.flatMap((g) => g.pasos).length ? mi.score : grupos.flatMap((g) => g.pasos)[paso].hasta) }}
              transition={{ type: "spring", bounce: 0.25, duration: 0.7 }}
              opacity={0.35}
            />
          )}
        </svg>
      )}
      <Tooltip estado={tt} />
    </div>
  );
}

/* ------------------------------------------------------------------ Tabla */

function TablaDesglose({ modelo, grupos }: { modelo: Modelo; grupos: ReturnType<typeof usePasos>["grupos"] }) {
  return (
    <div className="table-wrap" style={{ marginTop: 8 }}>
      <table className="data">
        <thead>
          <tr>
            <th>Factor</th>
            <th>Tu valor</th>
            <th>Tu tramo</th>
            <th className="num">Puntos</th>
            <th className="num">Acumulado</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <b>Punto de partida</b>
            </td>
            <td colSpan={3} className="muted">
              Persona promedio
            </td>
            <td className="num">{modelo.base}</td>
          </tr>
          {grupos.map((g) => (
            <Fragment key={g.pilar.id}>
              <tr>
                <td colSpan={5} className="eyebrow" style={{ paddingTop: 16 }}>
                  {g.pilar.nombre}
                </td>
              </tr>
              {g.pasos.map((p) => (
                <tr key={p.f.id}>
                  <td>{p.f.nombre}</td>
                  <td>{valorFactor(p.f, p.valor)}</td>
                  <td className="ink2">{p.tramo >= 0 ? p.f.tramos[p.tramo].etiqueta : p.f.nulo?.etiqueta}</td>
                  <td className="num">
                    <b>{signo(p.puntos)}</b>
                  </td>
                  <td className="num">{p.hasta}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ Ecuacion */

function Ecuacion(props: { modelo: Modelo; pasos: Paso[]; score: number; hover: string | null; setHover: (id: string | null) => void; onAbrir: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const visto = useInView(ref, { once: true, margin: "-40px" });
  return (
    <div ref={ref} className="ecuacion" aria-label="Fórmula de tu score">
      <p className="eyebrow">
        La fórmula completa
        <InfoTip>
          Cada factor aporta un número fijo de puntos según el tramo en que caes. No hay pesos ocultos ni ajustes manuales: si sumas
          estos números obtienes exactamente tu score.
        </InfoTip>
      </p>
      <div className="ecuacion-terminos">
        <motion.span className="termino base" initial={{ opacity: 0, y: 8 }} animate={visto ? { opacity: 1, y: 0 } : {}}>
          {props.modelo.base}
        </motion.span>
        {props.pasos.map((p, i) => (
          <motion.button
            key={p.f.id}
            type="button"
            className={`termino ${p.puntos > 0 ? "pos" : p.puntos < 0 ? "neg" : "cero"} ${props.hover === p.f.id ? "activo" : ""}`}
            initial={{ opacity: 0, y: 8 }}
            animate={visto ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.05 * (i + 1) }}
            onPointerEnter={() => props.setHover(p.f.id)}
            onPointerLeave={() => props.setHover(null)}
            onFocus={() => props.setHover(p.f.id)}
            onBlur={() => props.setHover(null)}
            onClick={() => props.onAbrir(p.f.id)}
            title={p.f.nombre}
          >
            <span className="op">{p.puntos < 0 ? "−" : "+"}</span>
            {Math.abs(p.puntos)}
            <small>{p.f.nombre}</small>
          </motion.button>
        ))}
        <motion.span className="termino igual" initial={{ opacity: 0, scale: 0.8 }} animate={visto ? { opacity: 1, scale: 1 } : {}} transition={{ delay: 0.05 * (props.pasos.length + 2), type: "spring" }}>
          = {props.score}
        </motion.span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Pilares */

function Pilares({ modelo, mi, grupos }: { modelo: Modelo; mi: MiScore; grupos: ReturnType<typeof usePasos>["grupos"] }) {
  return (
    <div className="pilares grid-3">
      {grupos.map((g, k) => {
        const factores = modelo.factores.filter((f) => f.pilar === g.pilar.id);
        const min = d3.sum(factores, (f) => f.rango_puntos[0]);
        const max = d3.sum(factores, (f) => f.rango_puntos[1]);
        const ref = modelo.referencia_pilares.aptos[g.pilar.id];
        // sin historial en bureau: esos factores valen 0, pero el score externo si cuenta
        const neutral = g.pilar.id === "historial" && !mi.tiene_historial;
        return (
          <motion.div
            key={g.pilar.id}
            className="card card-pad pilar"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: k * 0.1, duration: 0.5 }}
          >
            <p className="eyebrow">{g.pilar.nombre}</p>
            <p className="pilar-valor">
              {signo(g.total)}
              <span> pts</span>
              {neutral && <span className="chip" style={{ marginLeft: 10, verticalAlign: 6 }}>Bureau: neutral</span>}
            </p>
            <Bala min={min} max={max} valor={g.total} referencia={ref} />
            <p className="pilar-desc">{g.pilar.descripcion}</p>
            <p className="pilar-ref muted">
              Mediana de las personas aptas: <b className="ink2">{signo(Math.round(ref))}</b> · rango posible {signo(min)} a {signo(max)}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}

function Bala({ min, max, valor, referencia }: { min: number; max: number; valor: number; referencia: number }) {
  const [ref, w] = useAncho<HTMLDivElement>();
  const x = d3.scaleLinear([min, max], [6, Math.max(20, w - 6)]);
  return (
    <div ref={ref} className="bala">
      {w > 0 && (
        <svg width={w} height={44} role="img" aria-label={`Tu aporte ${valor}, mediana de aptos ${Math.round(referencia)}`}>
          <rect x={x(min)} y={14} width={x(max) - x(min)} height={12} rx={6} fill="var(--surface-3)" />
          <line x1={x(0)} x2={x(0)} y1={8} y2={32} stroke="var(--axis)" />
          <motion.rect
            y={14}
            height={12}
            rx={4}
            fill={valor >= 0 ? "var(--pos)" : "var(--neg)"}
            initial={{ x: x(0), width: 0 }}
            whileInView={{ x: x(Math.min(0, valor)), width: Math.abs(x(valor) - x(0)) }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          />
          <line x1={x(referencia)} x2={x(referencia)} y1={6} y2={34} stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round" />
          <text x={x(referencia)} y={44} textAnchor="middle" className="chart-muted" style={{ fontSize: 10.5 }}>
            aptos
          </text>
        </svg>
      )}
    </div>
  );
}
