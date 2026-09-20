# Genera automaticamente el CREATE TABLE para un csv, sin escribir las columnas a mano.
# Lee una muestra del csv, detecta el tipo de dato de pandas por columna, y lo mapea
# al tipo equivalente de Postgres. Lo usa load_raw.py antes de cargar cada tabla.

import pandas as pd

PG_TYPE_MAP = {
    "int64": "BIGINT",
    "float64": "DOUBLE PRECISION",
    "bool": "BOOLEAN",
    "object": "TEXT",
}


def infer_create_table(csv_path: str, table_name: str, schema: str = "raw", sample_rows: int = 100_000) -> str:
    # nrows=100_000 alcanza para inferir el tipo correcto sin leer el csv completo
    # (que puede pesar cientos de MB) solo para adivinar dtypes.
    sample = pd.read_csv(csv_path, nrows=sample_rows, low_memory=False)
    # cualquier dtype no mapeado (ej. columnas de texto en pandas 3.x) cae en TEXT por defecto.
    columns = [f'"{col}" {PG_TYPE_MAP.get(str(dtype), "TEXT")}' for col, dtype in sample.dtypes.items()]
    columns_sql = ",\n  ".join(columns)
    return (
        f'DROP TABLE IF EXISTS {schema}."{table_name}";\n'
        f'CREATE TABLE {schema}."{table_name}" (\n  {columns_sql}\n);'
    )
