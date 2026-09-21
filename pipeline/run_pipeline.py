# Orquestador: corre todo el pipeline en orden, un solo comando.
#   python run_pipeline.py
# Paso 1 (load_raw): csv limpios -> schema raw en Postgres.
# Paso 2 (transform_core): raw -> schema core (cifrado + flags), lo que usa la app.
# Paso 3 (score_model): entrena el scorecard transparente -> core.scores (lo que
# explica la web). Se puede re-correr solo con: python score_model.py

import load_raw
import score_model
import transform_core


def main():
    load_raw.main()
    transform_core.main()
    score_model.main()


if __name__ == "__main__":
    main()
