import * as d3 from "d3";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useConteo } from "../hooks";
import { entero, pct, signo } from "../lib/format";
import { bandaDe, tasaEnScore } from "../lib/scorecard";
import type { MiScore, Modelo } from "../types";
import { Icono, InfoTip, Section } from "./ui";

export default function Hero({ modelo, mi }: { modelo: Modelo; mi: MiScore }) {
  const banda = bandaDe(modelo, mi.score);
  const suma = mi.score - modelo.base;
  const faltan = modelo.umbral_apto - mi.score;
  const tasa = tasaEnScore(modelo, mi.score);
  const de100 = Math.max(1, Math.round(tasa * 100));

  return (
    <Section
      id="score"
      num="01"
      titulo="Tu score CrediFácil"
      lead={
        <>
          Un número de {modelo.escala.min} a {modelo.escala.max} que resume qué tan probable es que pagues a tiempo. Desde{" "}
          <strong>{modelo.umbral_apto}</strong> eres apto para un crédito, tengas o no historial bancario.
        </>
      }
    >
      <div className="hero">
        <div className="card hero-gauge">
          <Medidor modelo={modelo} score={mi.score} apto={mi.apto} />
          <div className="hero-estado">
            {mi.apto ? (
              <span className="chip chip-good">
                <Icono.check size={14} /> Apto para crédito · {banda.nombre}
              </span>
            ) : (
              <span className="chip chip-serious">
                <Icono.alerta size={14} /> {banda.nombre} · te faltan {faltan} {faltan === 1 ? "punto" : "puntos"}
              </span>
            )}
          </div>
        </div>

        <div className="hero-lado">
          <div className="card card-pad hero-relato">
            <p className="eyebrow">Tu score en una frase</p>
            <p className="relato">
              Partiste de <strong>{modelo.base}</strong>, el puntaje de una persona promedio. Tus factores suman{" "}
              <strong className={suma >= 0 ? "txt-pos" : "txt-neg"}>{signo(suma)}</strong> y te dejan en{" "}
              <strong>{mi.score}</strong>.{" "}
              {mi.apto ? (
                <>Estás {mi.score - modelo.umbral_apto} puntos por encima del umbral.</>
              ) : (
                <>
                  Te faltan <strong>{faltan}</strong> para ser apto
                  {mi.plan?.alcanzable ? <> y hay un camino concreto para lograrlo.</> : "."}
                </>
              )}
            </p>
            <div className="guia">
              <a href="#desglose">
                <span>02</span> Ver de dónde sale cada punto
              </a>
              <a href="#mejora">
                <span>03</span> {mi.apto ? "Subir de banda" : "Plan para ser apto"}
              </a>
              <a href="#comunidad">
                <span>04</span> Compararme
              </a>
            </div>
          </div>

          <div className="grid-2">
            <Percentil valor={mi.percentil} total={mi.total_clientes} />
            <div className="card card-pad stat">
              <p className="eyebrow">
                Riesgo observado
                <InfoTip>
                  No es una predicción sobre ti: es lo que pasó con las personas del dataset que tuvieron un score en tu mismo tramo de
                  10 puntos. Por eso sirve para entender qué significa tu número.
                </InfoTip>
              </p>
              <IconArray total={100} marcados={de100} />
              <p className="stat-pie">
                <strong>{de100} de cada 100</strong> personas con un score como el tuyo se atrasaron en sus pagos.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ Medidor */

function Medidor({ modelo, score, apto }: { modelo: Modelo; score: number; apto: boolean }) {
  const { min, max } = modelo.escala;
  const [numRef, valor] = useConteo<SVGTextElement>(score, 1.8, min);
  const W = 420;
  const r = 168;
  const ang = d3.scaleLinear([min, max], [-Math.PI * 0.72, Math.PI * 0.72]).clamp(true);
  const arco = d3.arc<[number, number]>()
    .innerRadius(r - 18)
    .outerRadius(r)
    .cornerRadius(9)
    .startAngle((d) => ang(d[0]))
    .endAngle((d) => ang(d[1]));
  const punto = (v: number, radio: number) => {
    const a = ang(v) - Math.PI / 2;
    return [Math.cos(a) * radio, Math.sin(a) * radio] as const;
  };
  const [px, py] = punto(valor, r - 9);
  const color = apto ? "var(--good)" : "var(--serious)";
  const [ux1, uy1] = punto(modelo.umbral_apto, r + 6);
  const [ux2, uy2] = punto(modelo.umbral_apto, r - 26);
  const [ulx, uly] = punto(modelo.umbral_apto, r + 22);

  return (
    <svg viewBox={`${-W / 2} ${-r - 44} ${W} ${r * 1.72 + 44}`} className="medidor" role="img" aria-label={`Score ${score} de ${max}. Umbral de aptitud ${modelo.umbral_apto}.`}>
      <path d={arco([min, max]) ?? ""} fill="var(--surface-3)" />
      {/* bandas: separadores y nombres alrededor del arco */}
      {modelo.bandas.slice(1).map((b) => {
        const [x1, y1] = punto(b.desde, r + 1);
        const [x2, y2] = punto(b.desde, r - 19);
        return <line key={b.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--surface)" strokeWidth={3} />;
      })}
      <path d={arco([min, Math.max(min + 4, valor)]) ?? ""} fill={color} />
      {/* umbral */}
      <line x1={ux1} y1={uy1} x2={ux2} y2={uy2} stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" />
      <text x={ulx} y={uly} textAnchor={ulx < 0 ? "end" : "start"} className="chart-text" style={{ fontWeight: 700 }}>
        Apto desde {modelo.umbral_apto}
      </text>
      {/* marcador del valor actual */}
      <circle cx={px} cy={py} r={11} fill={color} stroke="var(--surface)" strokeWidth={3} />
      {[min, 500, 700, max].map((t) => {
        const [x, y] = punto(t, r - 36);
        return (
          <text key={t} x={x} y={y + 4} textAnchor="middle" className="chart-muted">
            {t}
          </text>
        );
      })}
      <text y={-2} textAnchor="middle" className="medidor-num" ref={numRef}>
        {Math.round(valor)}
      </text>
      <text y={34} textAnchor="middle" className="chart-muted" style={{ fontSize: 14 }}>
        de {max} puntos
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ Percentil */

function Percentil({ valor, total }: { valor: number; total: number }) {
  const [ref, v] = useConteo<HTMLParagraphElement>(valor * 100, 1.4);
  return (
    <div className="card card-pad stat">
      <p className="eyebrow">
        Tu posición
        <InfoTip>
          El percentil indica qué porcentaje de las {entero(total)} solicitudes del dataset tiene un score menor al tuyo. No compara
          ingresos ni datos personales, solo el resultado final.
        </InfoTip>
      </p>
      <p className="stat-valor" ref={ref}>
        {Math.round(v)}%
      </p>
      <div className="percentil-barra" aria-hidden="true">
        <motion.span initial={{ width: 0 }} whileInView={{ width: `${valor * 100}%` }} viewport={{ once: true }} transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }} />
      </div>
      <p className="stat-pie">
        Superas al <strong>{pct(valor)}</strong> de los solicitantes.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ Icon array */

function IconArray({ total, marcados }: { total: number; marcados: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const visto = useInView(ref, { once: true });
  const reducido = useReducedMotion();
  const [n, setN] = useState(reducido ? marcados : 0);
  useEffect(() => {
    if (!visto || reducido) return setN(marcados);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setN(i);
      if (i >= marcados) clearInterval(id);
    }, 90);
    return () => clearInterval(id);
  }, [visto, marcados, reducido]);
  return (
    <div ref={ref} className="icon-array" role="img" aria-label={`${marcados} de ${total} personas se atrasaron`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < n ? "on" : ""} />
      ))}
    </div>
  );
}
