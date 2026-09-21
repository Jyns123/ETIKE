# Pool de conexiones a Postgres con el rol de minimo privilegio etike_app.

from contextlib import contextmanager

from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool

from .config import settings

_pool: ThreadedConnectionPool | None = None


def init_pool():
    global _pool
    _pool = ThreadedConnectionPool(minconn=1, maxconn=10, **settings.db)


def close_pool():
    if _pool:
        _pool.closeall()


@contextmanager
def cursor():
    """Cursor que devuelve filas como dict. Hace commit al salir sin error y
    rollback si hubo excepcion; la conexion siempre vuelve al pool."""
    conn = _pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)
