# Re-cifra con AES-256 las columnas que quedaron en AES-128 en bases cargadas
# antes de que transform_core.py pasara 'cipher-algo=aes256' (pgp_sym_encrypt
# sin opciones usa AES-128). Volver a correr transform_core.py no sirve: hace
# INSERT ... ON CONFLICT DO NOTHING, asi que no toca las filas ya cifradas.
#
#   python migrar_aes256.py
#
# Idempotente: solo toca las filas cuyo 4o byte (algoritmo del paquete OpenPGP)
# no es 09 = AES-256. Todo va en una transaccion: se re-cifra todo o nada.
# El texto en claro nunca sale de Postgres (se descifra y cifra en el mismo UPDATE).

import time

import psycopg2

from config import DB_CONFIG, ENCRYPTION_KEY

COLUMNAS = [
    ("core.solicitudes", "ingreso_cifrado"),
    ("core.solicitudes", "fecha_nacimiento_cifrada"),
    ("core.scores", "detalle_cifrado"),
    ("core.historial_bureau", "monto_deuda_cifrado"),
]


def main():
    if not ENCRYPTION_KEY:
        raise SystemExit("Falta HC_ENCRYPTION_KEY (env var), se usa para pgcrypto")
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        with conn.cursor() as cur:
            # la llave viaja en el texto del UPDATE: que Postgres no lo escriba
            # en su log si algo falla (igual que el rol etike_app de la web)
            cur.execute("SET LOCAL log_min_error_statement = panic")
            cur.execute("SET LOCAL log_statement = 'none'")
            for tabla, col in COLUMNAS:
                inicio = time.monotonic()
                cur.execute(
                    f"""UPDATE {tabla}
                        SET {col} = pgp_sym_encrypt(pgp_sym_decrypt({col}, %(key)s), %(key)s, 'cipher-algo=aes256')
                        WHERE {col} IS NOT NULL AND get_byte({col}, 3) <> 9""",
                    {"key": ENCRYPTION_KEY},
                )
                print(f"{tabla}.{col}: {cur.rowcount:,} filas re-cifradas ({time.monotonic() - inicio:.0f} s)")
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    main()
