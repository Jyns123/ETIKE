# Prepara la base para la web (idempotente, se puede re-correr):
#   1. genera web/backend/.env si no existe (contrasenias y llaves aleatorias;
#      HC_ENCRYPTION_KEY se copia de pipeline/.env)
#   2. crea/actualiza el rol etike_app (minimo privilegio)
#   3. crea el schema app y aplica permisos (sql/app_schema.sql)
#
#   python scripts/init_app_db.py
#
# Usa el superusuario del pipeline (pipeline/.env) solo para este setup; la
# app despues se conecta con etike_app.

import secrets
from pathlib import Path

import psycopg2
from dotenv import dotenv_values
from psycopg2 import sql

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parents[1]
PIPELINE_ENV = ROOT / "pipeline" / ".env"
APP_ENV = BACKEND / ".env"


def main():
    if not PIPELINE_ENV.exists():
        raise SystemExit(f"Falta {PIPELINE_ENV}: primero configurar y correr el pipeline")
    pipe = dotenv_values(PIPELINE_ENV)

    if not APP_ENV.exists():
        plantilla = (BACKEND / ".env.example").read_text(encoding="utf-8")
        valores = {
            "APP_DB_HOST": pipe.get("PGHOST", "localhost"),
            "APP_DB_PORT": pipe.get("PGPORT", "5432"),
            "APP_DB_NAME": pipe.get("PGDATABASE", "homecredit"),
            "APP_DB_PASSWORD": secrets.token_urlsafe(24),
            "HC_ENCRYPTION_KEY": pipe["HC_ENCRYPTION_KEY"],
            "PSEUDONYM_KEY": secrets.token_urlsafe(32),
        }
        lineas = []
        for linea in plantilla.splitlines():
            clave = linea.split("=", 1)[0]
            lineas.append(f"{clave}={valores[clave]}" if clave in valores and not linea.startswith("#") else linea)
        APP_ENV.write_text("\n".join(lineas) + "\n", encoding="utf-8")
        print(f"{APP_ENV} generado")
    app_env = dotenv_values(APP_ENV)

    conn = psycopg2.connect(host=pipe.get("PGHOST"), port=pipe.get("PGPORT"), dbname=pipe.get("PGDATABASE"),
                            user=pipe.get("PGUSER"), password=pipe.get("PGPASSWORD"))
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_roles WHERE rolname = 'etike_app'")
            verbo = "ALTER" if cur.fetchone() else "CREATE"
            cur.execute(sql.SQL("{} ROLE etike_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD {}").format(
                sql.SQL(verbo), sql.Literal(app_env["APP_DB_PASSWORD"])))
            cur.execute(sql.SQL("GRANT CONNECT ON DATABASE {} TO etike_app").format(
                sql.Identifier(pipe.get("PGDATABASE"))))
            cur.execute((BACKEND / "sql" / "app_schema.sql").read_text(encoding="utf-8"))
        conn.commit()
        print("rol etike_app y schema app listos")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
