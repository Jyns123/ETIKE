import * as d3 from "d3";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { Icono, Logo, Scramble } from "./ui";

// Deben coincidir con web/backend/scripts/seed_users.py
const DEMOS = [
  ["demo.limite", "A pocos puntos de ser apto"],
  ["demo.informal", "Sin historial crediticio"],
  ["demo.sinhistorial", "Sin historial y apto"],
  ["demo.atraso", "Con un atraso vigente"],
  ["demo.deudas", "Muchos créditos activos"],
  ["demo.excelente", "Score excelente"],
  ["demo.riesgo", "Riesgo alto"],
  ["analista", "Personal: indicadores"],
  ["admin", "Personal: auditoría"],
];

export default function Login({ aviso, onLogin }: { aviso: string | null; onLogin: () => Promise<void> }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [ver, setVer] = useState(false);
  const [mayus, setMayus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [intento, setIntento] = useState(0);
  const passRef = useRef<HTMLInputElement>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      await api.post("/api/auth/login", { usuario, password });
      setPassword("");
      await onLogin();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo conectar con el servidor");
      setIntento((i) => i + 1);
      setPassword("");
      passRef.current?.focus();
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login">
      <aside className="login-arte" aria-hidden="true">
        <div className="login-arte-top">
          <Logo size={34} />
          <span className="brand">CrediFácil</span>
        </div>
        <ArteScore />
        <div className="login-claim">
          <h1>
            Tu score,
            <br />
            sin cajas negras.
          </h1>
          <ul>
            <li>
              <span>01</span>Mira de dónde sale cada punto de tu score.
            </li>
            <li>
              <span>02</span>Descubre qué cambiar para ser apto, aunque no tengas historial.
            </li>
            <li>
              <span>03</span>Compárate con otros sin exponer a nadie: sus datos siguen cifrados.
            </li>
          </ul>
        </div>
      </aside>

      <main className="login-panel">
        <motion.form
          key={intento}
          onSubmit={enviar}
          className={`login-form card ${intento ? "shake" : ""}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          noValidate
        >
          <div className="login-form-head">
            <div className="login-mobile-brand">
              <Logo size={30} />
              <span className="brand">CrediFácil</span>
            </div>
            <h2>Ingresa a tu panel</h2>
            <p className="ink2">Usa las credenciales que te entregó CrediFácil.</p>
          </div>

          <AnimatePresence>
            {(error || aviso) && (
              <motion.div
                role="alert"
                className={`login-alerta ${error ? "es-error" : ""}`}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Icono.alerta size={16} />
                <span>{error ?? aviso}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <label className="campo">
            <span>Usuario</span>
            <input
              name="usuario"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              minLength={3}
              maxLength={40}
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="ej. demo.limite"
            />
          </label>

          <label className="campo">
            <span>Contraseña</span>
            <div className="campo-pass">
              <input
                ref={passRef}
                name="password"
                type={ver ? "text" : "password"}
                autoComplete="current-password"
                required
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={(e) => setMayus(e.getModifierState("CapsLock"))}
              />
              <button type="button" className="btn btn-ghost icon-btn" onClick={() => setVer((v) => !v)} aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={ver}>
                <Icono.ojo tachado={ver} />
              </button>
            </div>
            {mayus && <small className="campo-nota">Bloq Mayús está activado</small>}
          </label>

          <button className="btn btn-primary login-submit" disabled={cargando || usuario.length < 3 || !password}>
            {cargando ? <span className="spinner" aria-label="Verificando" /> : <>Ingresar <Icono.flecha /></>}
          </button>

          <ul className="login-seguridad">
            <li>
              <Icono.candado size={14} /> Conexión cifrada con TLS (certificado de CA propia)
            </li>
            <li>
              <Icono.escudo size={14} /> Tu contraseña se guarda como hash Argon2id, nunca en texto plano
            </li>
            <li>
              <Icono.check size={14} /> Sesión en cookie HttpOnly que expira tras 30 min sin actividad
            </li>
          </ul>

          <details className="login-demos">
            <summary>Cuentas de demostración</summary>
            <p className="muted">La contraseña es la que mostró el script de carga de usuarios.</p>
            <div className="login-demos-grid">
              {DEMOS.map(([u, d]) => (
                <button key={u} type="button" onClick={() => (setUsuario(u), passRef.current?.focus())}>
                  <span className="mono">{u}</span>
                  <small>{d}</small>
                </button>
              ))}
            </div>
          </details>
        </motion.form>
      </main>
    </div>
  );
}

/* Arte animado: un medidor de score que se arma sumando factores, sobre
   lineas de texto cifrado. Es la idea de la pagina en 5 segundos. */
const FACTORES_ARTE = [
  { t: "Cuota vs. ingreso", p: 14 },
  { t: "Antigüedad laboral", p: 24 },
  { t: "Uso de tus créditos", p: -11 },
  { t: "Sin historial externo", p: 0 },
];

function ArteScore() {
  const reducido = useReducedMotion();
  const [ciclo, setCiclo] = useState(0);
  useEffect(() => {
    if (reducido) return;
    const id = setInterval(() => setCiclo((c) => c + 1), 7000);
    return () => clearInterval(id);
  }, [reducido]);

  const final = 627;
  const v = useBarrido(final, ciclo);
  const r = 150;
  const ang = d3.scaleLinear([300, 850], [-Math.PI * 0.75, Math.PI * 0.75]);
  const ticks = d3.range(300, 851, 11);
  const arco = d3.arc<{ a0: number; a1: number }>()
    .innerRadius(r - 8)
    .outerRadius(r)
    .cornerRadius(4)
    .startAngle((d) => d.a0)
    .endAngle((d) => d.a1);
  const lineas = ["c30d04090302f4e00b677d2121c87fd2370167d4", "a91be07d33c5e8b2410f9dd6c1a0b47e8c2257f1", "5e0b77c2d9a4f13b86e0c5d27f9a1b3c4d8e6f20", "d2370167d4c30d04070302bb87786d866d709277"];

  return (
    <div className="arte-score">
      <svg viewBox="-200 -200 400 330" className="arte-svg">
        {ticks.map((t) => {
          const a = ang(t) - Math.PI / 2;
          const mayor = t % 50 === 0;
          return (
            <line
              key={t}
              x1={Math.cos(a) * (r + 16)}
              y1={Math.sin(a) * (r + 16)}
              x2={Math.cos(a) * (r + (mayor ? 30 : 22))}
              y2={Math.sin(a) * (r + (mayor ? 30 : 22))}
              stroke={t <= v ? "var(--ink-2)" : "var(--axis)"}
              strokeWidth={mayor ? 2 : 1}
              opacity={t <= v ? 1 : 0.45}
            />
          );
        })}
        <path d={arco({ a0: ang(300), a1: ang(850) }) ?? ""} fill="var(--surface-3)" />
        <path d={arco({ a0: ang(300), a1: ang(Math.max(305, v)) }) ?? ""} fill="var(--pos)" />
        <text y={-8} textAnchor="middle" className="arte-num">
          {Math.round(v)}
        </text>
        <text y={26} textAnchor="middle" className="chart-muted" style={{ fontSize: 14 }}>
          base + tus factores
        </text>
      </svg>
      <div className="arte-chips">
        {FACTORES_ARTE.map((f, i) => (
          <motion.span
            key={`${ciclo}-${f.t}`}
            className="arte-chip"
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.6 + i * 0.5, type: "spring", bounce: 0.35 }}
          >
            <i style={{ background: f.p > 0 ? "var(--pos)" : f.p < 0 ? "var(--neg)" : "var(--axis)" }} />
            {f.t}
            <b>{f.p > 0 ? `+${f.p}` : f.p < 0 ? `−${-f.p}` : "0"}</b>
          </motion.span>
        ))}
      </div>
      <div className="arte-cifrado">
        {lineas.map((l, i) => (
          <Scramble key={`${ciclo}-${i}`} texto={l} duracion={1600 + i * 400} className="cipher" />
        ))}
      </div>
    </div>
  );
}

/** Valor que barre de 300 al objetivo cada vez que cambia `ciclo`. */
function useBarrido(hasta: number, ciclo: number) {
  const [v, setV] = useState(300);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setV(hasta);
    setV(300);
    const t = d3.timer((ms) => {
      const p = Math.min(1, ms / 2600);
      setV(300 + (hasta - 300) * d3.easeCubicOut(p));
      if (p >= 1) t.stop();
    }, 400);
    return () => t.stop();
  }, [hasta, ciclo]);
  return v;
}
