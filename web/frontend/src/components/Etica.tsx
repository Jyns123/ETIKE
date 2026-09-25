import { motion } from "motion/react";
import { entero, pct } from "../lib/format";
import type { MiScore, Modelo } from "../types";
import { Icono, InfoTip, Section } from "./ui";

export default function Etica({ modelo, mi }: { modelo: Modelo; mi: MiScore }) {
  const c = modelo.comparacion;
  const filas = [
    { label: "Aprobación sin historial", sc: c.scorecard.aprobacion_sin_historial, tr: c.tradicional.aprobacion_sin_historial },
    { label: "Aprobación con historial", sc: c.scorecard.aprobacion_con_historial, tr: c.tradicional.aprobacion_con_historial },
    { label: "Atrasos entre aprobados", sc: c.scorecard.default_aprobados, tr: c.tradicional.default_aprobados },
  ];
  const maxV = Math.max(...filas.map((f) => Math.max(f.sc, f.tr)));
  const total = modelo.distribucion.reduce((a, d) => a + d.n, 0);
  const conHistorial = modelo.distribucion.reduce((a, d) => a + d.n_con_historial, 0);

  return (
    <Section
      id="etica"
      num="05"
      titulo="Lo que no usamos (y por qué)"
      lead={
        <>
          Un modelo podría ser un poco más preciso usando tu edad, tu género o tu barrio. Decidimos no hacerlo. Aquí están esas decisiones y lo
          que cuestan, medido con los mismos datos.
        </>
      }
    >
      <div className="excluidas">
        {modelo.excluidas.map((x, i) => (
          <motion.div
            key={x.variable}
            className="card excluida"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-30px" }}
            transition={{ delay: (i % 3) * 0.07 }}
          >
            <div className="excluida-top">
              <span className="tachado">{x.nombre}</span>
              <span className="mono muted" style={{ fontSize: 11 }}>
                {x.variable}
              </span>
            </div>
            <p className="ink2">{x.motivo}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card card-pad">
          <p className="eyebrow">Política de neutralidad</p>
          <h3 className="card-h3" style={{ marginTop: 6 }}>
            No tener historial no te resta puntos
          </h3>
          <p className="ink2" style={{ marginTop: 8 }}>
            El {pct(1 - conHistorial / total, 1)} de las solicitudes no tiene ningún crédito previo en bureau: es el cliente «informal» para el que existe
            CrediFácil. En los datos ese grupo se atrasa algo más, así que un modelo tradicional lo castiga. Nosotros fijamos en 0 los puntos de
            «sin historial»: se te evalúa por tu capacidad de pago y tu estabilidad.
          </p>
          {!mi.tiene_historial && (
            <p className="nota-neutral" style={{ marginTop: 14 }}>
              <Icono.escudo size={16} />
              <span>Es tu caso: tus factores de bureau valen 0, ni a favor ni en contra.</span>
            </p>
          )}
        </div>

        <div className="card card-pad">
          <p className="eyebrow">
            El costo de ser justos
            <InfoTip>
              AUC mide qué tan bien el modelo ordena a quienes pagan sobre quienes se atrasan (0.5 = azar, 1 = perfecto). Ambos modelos se
              evaluaron sobre el mismo 20% de datos que no se usó para entrenar.
            </InfoTip>
          </p>
          <div className="auc">
            <div>
              <span className="auc-num">{modelo.metricas.auc.toFixed(3)}</span>
              <span className="muted">AUC de este score</span>
            </div>
            <div>
              <span className="auc-num muted">{c.auc_tradicional.toFixed(3)}</span>
              <span className="muted">AUC con variables sensibles</span>
            </div>
          </div>
          <p className="ink2" style={{ marginTop: 10 }}>
            Excluirlas cuesta <b>{c.costo_auc.toFixed(3)}</b> de AUC. A cambio, con la misma tasa de aprobación global ({pct(c.scorecard.aprobacion)}):
          </p>
          <div className="comparativa" role="table" aria-label="Comparación con un modelo tradicional">
            {filas.map((f, i) => (
              <div key={f.label} className="comp-fila" role="row">
                <span role="rowheader" className="comp-label">
                  {f.label}
                </span>
                <span role="cell" className="comp-barras">
                  <span className="comp-barra">
                    <motion.i style={{ background: "var(--pos)" }} initial={{ width: 0 }} whileInView={{ width: `${(f.sc / maxV) * 100}%` }} viewport={{ once: true }} transition={{ delay: 0.1 + i * 0.1, duration: 0.7 }} />
                    <em>{pct(f.sc, 1)}</em>
                  </span>
                  <span className="comp-barra">
                    <motion.i style={{ background: "var(--axis)" }} initial={{ width: 0 }} whileInView={{ width: `${(f.tr / maxV) * 100}%` }} viewport={{ once: true }} transition={{ delay: 0.15 + i * 0.1, duration: 0.7 }} />
                    <em>{pct(f.tr, 1)}</em>
                  </span>
                </span>
              </div>
            ))}
          </div>
          <div className="legend" style={{ marginTop: 10 }}>
            <span>
              <i className="key" style={{ background: "var(--pos)" }} /> Score CrediFácil
            </span>
            <span>
              <i className="key" style={{ background: "var(--axis)" }} /> Modelo tradicional
            </span>
          </div>
        </div>
      </div>

      <div className="card card-pad ficha" style={{ marginTop: 16 }}>
        <p className="eyebrow">Ficha del modelo</p>
        <dl>
          <div>
            <dt>Tipo</dt>
            <dd>Scorecard: tramos + regresión logística sobre WoE</dd>
          </div>
          <div>
            <dt>Datos</dt>
            <dd>
              {entero(modelo.n_total)} solicitudes (Home Credit), {entero(modelo.n_entrenamiento)} para entrenar
            </dd>
          </div>
          <div>
            <dt>Escala</dt>
            <dd>
              {modelo.escala.min}–{modelo.escala.max}; cada {modelo.escala.pdo} puntos se duplica la razón pagan / se atrasan
            </dd>
          </div>
          <div>
            <dt>Umbral apto</dt>
            <dd>{modelo.umbral_apto}: donde la tasa de atraso observada baja de 10%</dd>
          </div>
          <div>
            <dt>Gini</dt>
            <dd>{modelo.metricas.gini.toFixed(3)}</dd>
          </div>
          <div>
            <dt>Versión</dt>
            <dd className="mono">
              {modelo.version} · {new Date(modelo.entrenado_en).toLocaleDateString("es-PE")}
            </dd>
          </div>
        </dl>
      </div>
    </Section>
  );
}
