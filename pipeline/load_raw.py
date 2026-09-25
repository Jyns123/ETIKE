# Paso 1 del pipeline: carga los csv limpios (dataset/) a Postgres, sin
# transformar nada todavia. Crea el schema "raw", que es una
# copia fiel del csv (sin cifrar), y le agrega indices en las columnas de join
# (SK_ID_CURR, etc.) para que transform_core.py despues cruce rapido.
#
# application_test.csv no se carga: en este proyecto las "solicitudes nuevas"
# las genera el formulario del front en vivo, no un csv de Kaggle.

from pathlib import Path

import psycopg2

from config import DB_CONFIG
from infer_schema import infer_create_table

DATA_DIR = Path(__file__).parent.parent / "dataset"

FILES = [
    ("application_train_clean.csv", "application_train_clean"),
    ("bureau_clean.csv", "bureau_clean"),
]

KEY_COLUMNS = ("SK_ID_CURR", "SK_ID_PREV", "SK_ID_BUREAU")


def load_csv(conn, csv_path: Path, table: str):
    ddl = infer_create_table(str(csv_path), table, schema="raw")
    with conn.cursor() as cur:
        cur.execute("CREATE SCHEMA IF NOT EXISTS raw;")
        cur.execute(ddl)
        # COPY es el comando nativo de Postgres para carga masiva: mucho mas
        # rapido que insertar fila por fila, esencial con csv de cientos de MB.
        # encoding explicito: en Windows open() usa cp1252 por defecto y
        # corromperia los acentos del csv (ej. "Sin organización").
        with open(csv_path, "r", encoding="utf-8") as f:
            cur.copy_expert(f'COPY raw."{table}" FROM STDIN WITH CSV HEADER', f)
        # indexa solo las columnas de join que esa tabla realmente tenga.
        for key_col in KEY_COLUMNS:
            cur.execute(
                """
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'raw' AND table_name = %s AND column_name = %s
                """,
                (table, key_col),
            )
            if cur.fetchone():
                cur.execute(f'CREATE INDEX IF NOT EXISTS idx_{table}_{key_col} ON raw."{table}" ("{key_col}");')
    conn.commit()
    print(f"raw.{table} cargada")


def main():
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        for filename, table in FILES:
            load_csv(conn, DATA_DIR / filename, table)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
