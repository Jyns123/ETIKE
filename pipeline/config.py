# Configuracion del pipeline: credenciales de Postgres y llave de cifrado.
# Todo se lee de variables de entorno (ver .env.example), nada queda hardcodeado
# ni se sube a git. Los demas scripts del pipeline importan DB_CONFIG y ENCRYPTION_KEY
# desde aca.

import os

DB_CONFIG = dict(
    host=os.environ.get("PGHOST", "localhost"),
    port=os.environ.get("PGPORT", "5432"),
    dbname=os.environ.get("PGDATABASE", "homecredit"),
    user=os.environ.get("PGUSER", "postgres"),
    password=os.environ.get("PGPASSWORD", ""),
)

# Llave simetrica usada por pgcrypto (pgp_sym_encrypt/pgp_sym_decrypt) para cifrar
# columnas sensibles en transform_core.py. Sin esta llave, no se puede correr el pipeline.
ENCRYPTION_KEY = os.environ.get("HC_ENCRYPTION_KEY")
