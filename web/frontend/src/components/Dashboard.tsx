import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { escenarioInicial, type Escenario } from "../lib/scorecard";
import type { MiScore, Modelo, Sesion } from "../types";
import Comunidad from "./Comunidad";
import Desglose from "./Desglose";
import Etica from "./Etica";
import Hero from "./Hero";
import Mejora from "./Mejora";
import MisDatos from "./MisDatos";
import Topbar from "./Topbar";

export const SECCIONES = [
  { id: "score", label: "Tu score" },
  { id: "desglose", label: "De dónde sale" },
  { id: "mejora", label: "Cómo mejorar" },
  { id: "comunidad", label: "Compárate" },
  { id: "etica", label: "Lo que no usamos" },
  { id: "datos", label: "Tus datos" },
];

export default function Dashboard(props: { sesion: Sesion; onSalir: () => void; onTema: () => void }) {
  const [modelo, setModelo] = useState<Modelo | null>(null);
  const [mi, setMi] = useState<MiScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [escenario, setEscenario] = useState<Escenario | null>(null);

  useEffect(() => {
    Promise.all([api.get<Modelo>("/api/modelo"), api.get<MiScore>("/api/mi/score")])
      .then(([m, s]) => {
        setModelo(m);
        setMi(s);
        setEscenario(escenarioInicial(s));
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <Topbar sesion={props.sesion} alias={mi?.alias} secciones={SECCIONES} onSalir={props.onSalir} onTema={props.onTema} />
      {error && (
        <div className="container" role="alert" style={{ paddingTop: 48 }}>
          <p className="card card-pad">{error}</p>
        </div>
      )}
      {!modelo || !mi || !escenario ? (
        !error && <Cargando />
      ) : (
        <main>
          <Hero modelo={modelo} mi={mi} />
          <Desglose modelo={modelo} mi={mi} />
          <Mejora modelo={modelo} mi={mi} escenario={escenario} setEscenario={setEscenario} />
          <Comunidad modelo={modelo} mi={mi} />
          <Etica modelo={modelo} mi={mi} />
          <MisDatos />
          <footer className="footer container">
            Modelo <span className="mono">{modelo.version}</span> · entrenado con {modelo.n_entrenamiento.toLocaleString("es-PE")} solicitudes
            del dataset Home Credit · Proyecto DS3031 Ética y Seguridad de Datos. Los montos están en las unidades monetarias
            (u.m.) del dataset original.
          </footer>
        </main>
      )}
    </>
  );
}

function Cargando() {
  return (
    <div className="cargando" aria-live="polite">
      <motion.div className="cargando-anillo" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }} />
      <p className="muted">Descifrando tu información…</p>
    </div>
  );
}
