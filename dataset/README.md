# dataset/

Acá van los 2 csv limpios (no se suben a git por peso, ~118-173MB cada uno):

- application_train_clean.csv
- bureau_clean.csv

Descargarlos del Drive del equipo y colocarlos directo en esta carpeta, con esos nombres exactos. El pipeline (pipeline/load_raw.py) los busca en esta ruta.

Alternativa: correr notebooks/limpieza_datos.ipynb, que los genera acá mismo desde los csv crudos de Kaggle.

## complementarios/

`contexto_peru.csv` (este sí va a git, es pequeño): indicadores públicos del Perú (INEI, ENAHO, SBS) que complementan el dataset de Home Credit para dimensionar el caso de negocio y fijar metas realistas (informalidad laboral, adultos fuera del sistema financiero, morosidad de las entidades MYPE). Cada fila trae su fuente, periodo y URL. Se usa en el informe (`docs/index.md`, sección 1.2 y OKRs).
