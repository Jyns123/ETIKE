// Avisos que solo aparecen en la demo estatica (npm run build:demo): dejan
// claro que no hay servidor y enlazan de vuelta al informe.

import { Icono } from "../components/ui";

/** Contrasenia de todas las cuentas de la demo. */
export const PASSWORD_DEMO = "demo";

// la demo se publica en /ETIKE/demo/ y el informe en /ETIKE/
const INFORME = "../";

export function DemoLogin() {
  return (
    <div className="demo-aviso" role="note">
      <b>Demo estática, sin servidor</b>
      <span>
        Elige una cuenta de abajo (contraseña <span className="mono">{PASSWORD_DEMO}</span>). Los scores, el modelo y los datos cifrados son
        respuestas reales del backend, exportadas para estas cuentas; el login, la sesión y la auditoría se simulan en tu navegador.
      </span>
      <span>
        La seguridad real (Argon2id, cookie HttpOnly, TLS con CA propia, pgcrypto) corre en la versión local.{" "}
        <a href={INFORME}>Ver el informe</a>
      </span>
    </div>
  );
}

export function DemoCinta() {
  return (
    <div className="demo-cinta" role="note">
      <Icono.escudo size={13} />
      <span>Demo estática</span>
      <a href={INFORME}>Leer el informe →</a>
    </div>
  );
}
