# Paso 2 del pipeline: toma lo cargado en el schema "raw" (load_raw.py) y arma
# el schema "core", que es el que deberia usar el backend/frontend de la app.
#
# Diferencia clave con raw: aca los campos sensibles quedan CIFRADOS con
# pgcrypto (pgp_sym_encrypt), y se copian los flags que el notebook de
# limpieza ya calculo (tiene_historial_bureau, tiene_ext_source_*,
# dias_empleado_anomalo, deuda_negativa) en vez de recalcularlos.

import psycopg2

from config import DB_CONFIG, ENCRYPTION_KEY

# core.solicitudes = 1 fila por cliente. core.historial_bureau = su historial
# crediticio externo (1 cliente puede tener 0, 1 o varios creditos bureau).
DDL = """
CREATE SCHEMA IF NOT EXISTS core;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS core.solicitudes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sk_id_curr BIGINT UNIQUE NOT NULL,
    ingreso_cifrado BYTEA,
    fecha_nacimiento_cifrada BYTEA,
    monto_credito NUMERIC,
    anualidad NUMERIC,
    tipo_contrato TEXT,
    ocupacion TEXT,
    organizacion TEXT,
    target INT,
    tiene_historial_bureau BOOLEAN,
    ext_source_1 DOUBLE PRECISION,
    ext_source_2 DOUBLE PRECISION,
    ext_source_3 DOUBLE PRECISION,
    tiene_ext_source_1 BOOLEAN,
    tiene_ext_source_2 BOOLEAN,
    tiene_ext_source_3 BOOLEAN,
    dias_empleado_anomalo BOOLEAN,
    fecha_carga TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.historial_bureau (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sk_id_curr BIGINT NOT NULL REFERENCES core.solicitudes(sk_id_curr),
    credito_activo TEXT,
    monto_deuda_cifrado BYTEA,
    deuda_negativa BOOLEAN,
    dias_atraso INT,
    tipo_credito TEXT
);
"""

# pgp_sym_encrypt cifra ingreso, fecha de nacimiento y deuda con la llave de .env.
# Las columnas "X" = 1 convierten los flags 0/1 del csv (int) a BOOLEAN de Postgres.
INSERT_SOLICITUDES = """
INSERT INTO core.solicitudes
    (sk_id_curr, ingreso_cifrado, fecha_nacimiento_cifrada, monto_credito,
     anualidad, tipo_contrato, ocupacion, organizacion, target, tiene_historial_bureau,
     ext_source_1, ext_source_2, ext_source_3,
     tiene_ext_source_1, tiene_ext_source_2, tiene_ext_source_3,
     dias_empleado_anomalo)
SELECT
    a."SK_ID_CURR",
    pgp_sym_encrypt(a."AMT_INCOME_TOTAL"::text, %(key)s, 'cipher-algo=aes256'),
    pgp_sym_encrypt(a."DAYS_BIRTH"::text, %(key)s, 'cipher-algo=aes256'),
    a."AMT_CREDIT",
    a."AMT_ANNUITY",
    a."NAME_CONTRACT_TYPE",
    a."OCCUPATION_TYPE",
    a."ORGANIZATION_TYPE",
    a."TARGET",
    a."TIENE_HISTORIAL_BUREAU" = 1,
    a."EXT_SOURCE_1",
    a."EXT_SOURCE_2",
    a."EXT_SOURCE_3",
    a."TIENE_EXT_SOURCE_1" = 1,
    a."TIENE_EXT_SOURCE_2" = 1,
    a."TIENE_EXT_SOURCE_3" = 1,
    a."DAYS_EMPLOYED_ANOM" = 1
FROM raw.application_train_clean a
ON CONFLICT (sk_id_curr) DO NOTHING;
"""

# solo copia historial de clientes que ya existen en core.solicitudes (excluye
# de paso cualquier cliente de bureau que no haya quedado en application_train).
INSERT_BUREAU = """
INSERT INTO core.historial_bureau
    (sk_id_curr, credito_activo, monto_deuda_cifrado, deuda_negativa, dias_atraso, tipo_credito)
SELECT
    b."SK_ID_CURR",
    b."CREDIT_ACTIVE",
    pgp_sym_encrypt(b."AMT_CREDIT_SUM_DEBT"::text, %(key)s, 'cipher-algo=aes256'),
    b."DEBT_NEGATIVA_FLAG" = 1,
    b."CREDIT_DAY_OVERDUE",
    b."CREDIT_TYPE"
FROM raw.bureau_clean b
WHERE b."SK_ID_CURR" IN (SELECT sk_id_curr FROM core.solicitudes);
"""


def main():
    if not ENCRYPTION_KEY:
        raise SystemExit("Falta HC_ENCRYPTION_KEY (env var), se usa para pgcrypto")
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        with conn.cursor() as cur:
            cur.execute(DDL)
            cur.execute(INSERT_SOLICITUDES, {"key": ENCRYPTION_KEY})
            cur.execute(INSERT_BUREAU, {"key": ENCRYPTION_KEY})
        conn.commit()
        print("core.solicitudes y core.historial_bureau poblados")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
