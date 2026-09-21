# Crea cuentas demo: clientes elegidos para mostrar casos distintos del score
# (con/sin historial, justo bajo el umbral, con atraso, etc.) + un analista y
# un admin. Las contrasenias se guardan solo como hash Argon2id.
#
#   python scripts/seed_users.py                      -> genera una contrasenia aleatoria y la muestra 1 vez
#   DEMO_PASSWORD='algo-largo-y-propio' python scripts/seed_users.py
#
# Re-correrlo resetea la contrasenia de las cuentas demo.

import json
import os
import secrets
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import RealDictCursor

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import settings  # noqa: E402
from app.security import hash_password  # noqa: E402

# (usuario, descripcion, filtro SQL sobre core.scores, filtro python sobre el detalle)
ESCENARIOS = [
    ("demo.excelente", "Score excelente con historial", "score >= 720 AND tiene_historial", None),
    ("demo.bueno", "Buen score, margen para subir", "score BETWEEN 650 AND 690 AND tiene_historial", None),
    ("demo.apto", "Apto por poco", "score BETWEEN 580 AND 588 AND tiene_historial", None),
    ("demo.limite", "A pocos puntos del umbral", "score BETWEEN 566 AND 578 AND tiene_historial",
     lambda d: d["valores"]["carga_cuota"] >= 0.15),
    ("demo.sinhistorial", "Sin historial en bureau y apto", "score BETWEEN 610 AND 660 AND NOT tiene_historial", None),
    ("demo.informal", "Sin historial, cerca del umbral", "score BETWEEN 555 AND 575 AND NOT tiene_historial",
     lambda d: d["valores"]["credito_bien"] >= 1.1),
    ("demo.atraso", "Con un atraso vigente", "score BETWEEN 530 AND 579 AND tiene_historial",
     lambda d: d["valores"]["atraso_actual"] == 1),
    ("demo.deudas", "Muchos créditos y deuda al límite", "score BETWEEN 520 AND 579 AND tiene_historial",
     lambda d: (d["valores"]["creditos_activos"] or 0) >= 4 and (d["valores"]["uso_deuda"] or 0) >= 0.8),
    ("demo.pension", "Pensionado, sin empleo actual", "score BETWEEN 600 AND 680",
     lambda d: d["valores"]["anios_empleo"] is None),
    ("demo.riesgo", "Riesgo alto", "score < 490", None),
]
INTERNOS = [("analista", "analista"), ("admin", "admin")]


def main():
    password = os.environ.get("DEMO_PASSWORD") or secrets.token_urlsafe(12)
    if len(password) < 12:
        raise SystemExit("DEMO_PASSWORD debe tener al menos 12 caracteres")

    conn = psycopg2.connect(**settings.db)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            usados = set()
            creados = []
            for usuario, desc, filtro, cond in ESCENARIOS:
                cur.execute(f"""SELECT sk_id_curr, score, pgp_sym_decrypt(detalle_cifrado, %s) AS det
                                FROM core.scores WHERE {filtro}
                                ORDER BY md5(sk_id_curr::text) LIMIT 400""", (settings.encryption_key,))
                elegido = next((r for r in cur.fetchall()
                                if r["sk_id_curr"] not in usados and (cond is None or cond(json.loads(r["det"])))), None)
                if not elegido:
                    print(f"  (sin candidato para {usuario})")
                    continue
                usados.add(elegido["sk_id_curr"])
                # upsert (no DELETE): la cuenta puede tener registros de auditoria
                # que la referencian. hash_password por cuenta: cada una lleva su propia sal.
                cur.execute("""INSERT INTO app.usuarios (usuario, password_hash, rol, sk_id_curr)
                               VALUES (%s, %s, 'cliente', %s)
                               ON CONFLICT (usuario) DO UPDATE SET password_hash = EXCLUDED.password_hash,
                                   sk_id_curr = EXCLUDED.sk_id_curr, intentos_fallidos = 0, bloqueado_hasta = NULL""",
                            (usuario, hash_password(password), elegido["sk_id_curr"]))
                creados.append((usuario, "cliente", elegido["score"], desc))
            for usuario, rol in INTERNOS:
                cur.execute("""INSERT INTO app.usuarios (usuario, password_hash, rol) VALUES (%s, %s, %s)
                               ON CONFLICT (usuario) DO UPDATE SET password_hash = EXCLUDED.password_hash,
                                   intentos_fallidos = 0, bloqueado_hasta = NULL""",
                            (usuario, hash_password(password), rol))
                creados.append((usuario, rol, "-", "Personal interno"))
        conn.commit()
    finally:
        conn.close()

    print(f"\n{'usuario':<20}{'rol':<10}{'score':<7}caso")
    for u, rol, s, d in creados:
        print(f"{u:<20}{rol:<10}{s!s:<7}{d}")
    if "DEMO_PASSWORD" not in os.environ:
        print(f"\nContraseña demo (se muestra solo esta vez, en la BD solo queda su hash Argon2id): {password}")


if __name__ == "__main__":
    main()
