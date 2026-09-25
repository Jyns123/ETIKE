# Exporta a JSON las respuestas reales del backend para las cuentas demo. Con
# eso se arma la demo estatica de GitHub Pages (web/frontend: npm run build:demo),
# que no tiene servidor.
#
#   python scripts/export_demo.py        -> web/frontend/src/demo/datos/
#
# Llama a los mismos endpoints que usa el front (TestClient, sin abrir un
# puerto) haciendose pasar por cada cuenta de app.usuarios. Cada llamada queda
# en la auditoria como siempre, marcada con detalle.origen = "export_demo" para
# que no se confunda con un acceso del titular.
#
# Que queda publico en la demo: el modelo (la web ya lo muestra a cualquier
# cliente) y, solo para las cuentas demo, su score, factores, sugerencias, sus
# campos cifrados (bytes) y su ingreso descifrado. Nunca el sk_id_curr (solo el
# alias HMAC), ni llaves, ni datos en claro de otros clientes (los vecinos van
# con alias, score redondeado e ingreso cifrado).

import json
import shutil
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import audit, db, security  # noqa: E402
from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402

DESTINO = Path(__file__).resolve().parents[2] / "frontend" / "src" / "demo" / "datos"


def _guardar(ruta: Path, datos) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    registrar = audit.registrar

    def registrar_export(request, accion, exito=True, **kw):
        kw["detalle"] = {**(kw.get("detalle") or {}), "origen": "export_demo"}
        registrar(request, accion, exito, **kw)

    audit.registrar = registrar_export
    actual: dict = {}
    app.dependency_overrides[security.usuario_actual] = lambda: actual
    origen = sorted(settings.allowed_origins)[0]  # el middleware anti-CSRF exige Origin en los POST

    with TestClient(app, base_url="https://localhost:8443", client=("127.0.0.1", 0)) as c:
        def pedir(metodo: str, ruta: str, **kw):
            r = c.request(metodo, ruta, headers={"Origin": origen}, **kw)
            if r.status_code != 200:
                raise SystemExit(f"{metodo} {ruta} como {actual.get('usuario')}: {r.status_code} {r.text}")
            return r.json()

        with db.cursor() as cur:
            cur.execute("SELECT id, usuario, rol, sk_id_curr FROM app.usuarios ORDER BY rol, usuario")
            cuentas = cur.fetchall()
        if not any(u["rol"] == "cliente" for u in cuentas):
            raise SystemExit("No hay cuentas demo: correr primero scripts/seed_users.py")

        if DESTINO.exists():
            shutil.rmtree(DESTINO)
        modelo = None
        for u in cuentas:
            actual.clear()
            actual.update(u)
            if u["rol"] == "cliente":
                modelo = modelo or pedir("GET", "/api/modelo")
                _guardar(DESTINO / "clientes" / f"{u['usuario']}.json", {
                    "score": pedir("GET", "/api/mi/score"),
                    "datos": pedir("GET", "/api/mi/datos"),
                    "ingreso": pedir("POST", "/api/mi/datos/descifrar", json={"campo": "ingreso"})["valor"],
                    "comunidad": pedir("GET", "/api/comunidad"),
                })
            elif u["rol"] == "analista":
                resumen = pedir("GET", "/api/interno/resumen")
                resumen.pop("seguridad_24h")  # la demo lo calcula con su propia auditoria
                solicitudes = [s for estado in ("pendiente", "aprobada", "rechazada")
                               for s in pedir("GET", "/api/interno/solicitudes", params={"estado": estado})]
                _guardar(DESTINO / "interno.json", {"resumen": resumen, "solicitudes": solicitudes})
            print(f"  {u['usuario']:<20}{u['rol']}")

    _guardar(DESTINO / "modelo.json", modelo)
    _guardar(DESTINO / "cuentas.json", [{"usuario": u["usuario"], "rol": u["rol"]} for u in cuentas])
    print(f"Datos de la demo en {DESTINO}")


if __name__ == "__main__":
    main()
