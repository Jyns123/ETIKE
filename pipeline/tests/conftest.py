# Estos tests corren contra Postgres real (con el pipeline ya corrido
# completo): no hay forma de probar el scorecard sin datos, el entrenamiento
# depende de la BD. Requieren pipeline/.env configurado.

import sys
from pathlib import Path

import psycopg2
import psycopg2.extras
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config import DB_CONFIG, ENCRYPTION_KEY  # noqa: E402


@pytest.fixture(scope="session")
def conn():
    c = psycopg2.connect(cursor_factory=psycopg2.extras.RealDictCursor, **DB_CONFIG)
    yield c
    c.close()


@pytest.fixture(scope="session")
def modelo(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT definicion FROM core.modelo_scorecard WHERE activo LIMIT 1")
        row = cur.fetchone()
    if not row:
        pytest.skip("no hay modelo activo: correr pipeline/score_model.py primero")
    return row["definicion"]


@pytest.fixture(scope="session")
def encryption_key():
    if not ENCRYPTION_KEY:
        pytest.skip("falta HC_ENCRYPTION_KEY en pipeline/.env")
    return ENCRYPTION_KEY
