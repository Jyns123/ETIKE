import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { ACCIONES_INTERNAS, entero, fechaHora, pct } from "../lib/format";
import type { Sesion } from "../types";
import Topbar from "./Topbar";
import { Icono, Section, Segmentado } from "./ui";

interface Resumen {
  grupos: { banda: string; tiene_historial: boolean; n: number; score_medio: number }[];
  seguridad_24h: { logins_ok: number; logins_fallidos: number; descifrados: number };
  metricas: { auc: number; gini: number };
  comparacion: { scorecard: { aprobacion: number; aprobacion_sin_historial: number; default_aprobados: number } };
  umbral_apto: number;
  version: string;
}

interface Registro {
  id: number;
  ts: string;
  usuario: string;
  rol: string | null;
  accion: string;
  recurso: string | null;
  exito: boolean;
  ip: string;
  sobre_cliente: boolean;
}

const BANDAS = [
  ["alto", "Riesgo alto"],
  ["construccion", "En construcción"],
  ["apto", "Apto"],
  ["bueno", "Bueno"],
  ["excelente", "Excelente"],
];

/** Vista del personal interno. El analista ve agregados; el admin ademas la
 *  auditoria. Ninguno ve ni descifra datos de un cliente puntual. */
export default function Interno(props: { sesion: Sesion; onSalir: () => void; onTema: () => void }) {
  const [r, setR] = useState<Resumen | null>(null);
  const [logs, setLogs] = useState<Registro[] | null>(null);
  const [filtro, setFiltro] = useState<"todo" | "fallos" | "datos">("todo");
  const esAdmin = props.sesion.rol === "admin";

  useEffect(() => {
    api.get<Resumen>("/api/interno/resumen").then(setR, () => undefined);
    if (esAdmin) api.get<Registro[]>("/api/interno/auditoria").then(setLogs, () => setLogs([]));
  }, [esAdmin]);

  const porBanda = useMemo(() => {
    if (!r) return [];
    return BANDAS.map(([id, nombre]) => {
      const g = r.grupos.filter((x) => x.banda === id);
      return {
        id,
        nombre,
        con: g.filter((x) => x.tiene_historial).reduce((a, x) => a + x.n, 0),
        sin: g.filter((x) => !x.tiene_historial).reduce((a, x) => a + x.n, 0),
      };
    });
  }, [r]);
  const maxBanda = Math.max(1, ...porBanda.map((b) => b.con + b.sin));
  const filtrados = (logs ?? []).filter((l) => (filtro === "fallos" ? !l.exito : filtro === "datos" ? l.sobre_cliente : true));

  return (
    <>
      <Topbar sesion={props.sesion} secciones={[]} onSalir={props.onSalir} onTema={props.onTema} />
      <main>
        <Section
          id="interno"
          num={esAdmin ? "ADMIN" : "ANALISTA"}
          titulo="Panel interno"
          lead={
            <>
              Indicadores agregados del score. Por diseño (mínimo privilegio) esta vista no permite ver ni descifrar los datos de ningún cliente
              {esAdmin ? "; como admin ves además el registro de auditoría" : ""}.
            </>
          }
        >
          {r && (
            <>
              <div className="grid-3">
                <Kpi label="Tasa de aprobación" valor={pct(r.comparacion.scorecard.aprobacion, 1)} nota={`score ≥ ${r.umbral_apto}`} />
                <Kpi label="Aprobación sin historial" valor={pct(r.comparacion.scorecard.aprobacion_sin_historial, 1)} nota="KPI de inclusión financiera" />
                <Kpi label="Atrasos entre aprobados" valor={pct(r.comparacion.scorecard.default_aprobados, 1)} nota={`AUC ${r.metricas.auc.toFixed(3)} · ${r.version}`} />
              </div>
              <div className="grid-2" style={{ marginTop: 16 }}>
                <div className="card card-pad">
                  <h3 className="card-h3">Clientes por banda</h3>
                  <div className="bandas-barras">
                    {porBanda.map((b, i) => (
                      <div key={b.id} className="banda-fila">
                        <span>{b.nombre}</span>
                        <span className="banda-track">
                          <motion.i style={{ background: "var(--pos)" }} initial={{ width: 0 }} animate={{ width: `${(b.con / maxBanda) * 100}%` }} transition={{ delay: i * 0.08, duration: 0.7 }} />
                          <motion.i style={{ background: "var(--axis)" }} initial={{ width: 0 }} animate={{ width: `${(b.sin / maxBanda) * 100}%` }} transition={{ delay: 0.2 + i * 0.08, duration: 0.7 }} />
                        </span>
                        <span className="tabular num">{entero(b.con + b.sin)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="legend" style={{ marginTop: 10 }}>
                    <span>
                      <i className="key" style={{ background: "var(--pos)" }} /> Con historial
                    </span>
                    <span>
                      <i className="key" style={{ background: "var(--axis)" }} /> Sin historial
                    </span>
                  </div>
                </div>
                <div className="card card-pad">
                  <h3 className="card-h3">Seguridad · últimas 24 h</h3>
                  <div className="grid-3" style={{ marginTop: 12 }}>
                    <Kpi label="Logins OK" valor={entero(r.seguridad_24h.logins_ok)} plano />
                    <Kpi label="Logins fallidos" valor={entero(r.seguridad_24h.logins_fallidos)} plano />
                    <Kpi label="Descifrados" valor={entero(r.seguridad_24h.descifrados)} plano />
                  </div>
                  <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
                    Un pico de logins fallidos es la primera alerta del plan de respuesta a incidentes (detección → contención).
                  </p>
                </div>
              </div>
            </>
          )}

          {esAdmin && (
            <div className="card card-pad" style={{ marginTop: 16 }}>
              <div className="barra-controles">
                <h3 className="card-h3">Registro de auditoría</h3>
                <Segmentado
                  label="Filtro"
                  valor={filtro}
                  onChange={setFiltro}
                  opciones={[
                    { id: "todo", label: "Todo" },
                    { id: "fallos", label: "Fallidos" },
                    { id: "datos", label: "Sobre clientes" },
                  ]}
                />
              </div>
              <div className="table-wrap" style={{ maxHeight: 520, overflowY: "auto" }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Usuario</th>
                      <th>Acción</th>
                      <th>Recurso</th>
                      <th>IP</th>
                      <th>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((l) => (
                      <tr key={l.id}>
                        <td className="tabular">{fechaHora(l.ts)}</td>
                        <td>
                          <span className="mono">{l.usuario}</span> <span className="muted">{l.rol ?? ""}</span>
                        </td>
                        <td>{ACCIONES_INTERNAS[l.accion] ?? l.accion}</td>
                        <td className="mono muted">{l.recurso ?? "—"}</td>
                        <td className="mono">{l.ip}</td>
                        <td>
                          {l.exito ? (
                            <span className="txt-good">
                              <Icono.check size={13} /> ok
                            </span>
                          ) : (
                            <span className="txt-serious">
                              <Icono.alerta size={13} /> fallido
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Section>
      </main>
    </>
  );
}

function Kpi({ label, valor, nota, plano }: { label: string; valor: string; nota?: string; plano?: boolean }) {
  return (
    <div className={plano ? "kpi-plano" : "card card-pad"}>
      <p className="eyebrow">{label}</p>
      <p className="stat-valor">{valor}</p>
      {nota && <p className="muted" style={{ fontSize: 13 }}>{nota}</p>}
    </div>
  );
}
