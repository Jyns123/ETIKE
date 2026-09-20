# Orquestador: corre todo el pipeline en orden, un solo comando.
#   python run_pipeline.py
# Paso 1 (load_raw): csv limpios -> schema raw en Postgres.
# Paso 2 (transform_core): raw -> schema core (cifrado + flags), lo que usa la app.

import load_raw
import transform_core


def main():
    load_raw.main()
    transform_core.main()


if __name__ == "__main__":
    main()
