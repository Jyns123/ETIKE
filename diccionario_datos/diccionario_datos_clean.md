# Diccionario de Datos: Post-limpieza (dataset/)

Este documento describe el estado FINAL de las variables después de aplicar notebooks/limpieza_datos.ipynb. Corresponde a los archivos dataset/application_train_clean.csv (80 columnas) y dataset/bureau_clean.csv (18 columnas), los que alimentan el pipeline hacia la base de datos (pipeline/load_raw.py).

Para el significado original de cada variable (antes de limpiar), ver diccionario_datos.md. Aquí solo se documenta qué cambió y el estado final de cada columna.

Columna **Estado**: Sin cambios / Transformada (imputada o corregida) / Nueva (derivada en la limpieza) / Eliminada.

Columna **Sensible**: Alto / Medio (proxy) / — no sensible. (heredado de diccionario_datos.md)

---

## 1. application_train_clean.csv (80 columnas, de las 122 originales)

### 1.1 Identificador y variable objetivo

| Variable | Estado | Sensible | Nota |
|---|---|---|---|
| SK_ID_CURR | Sin cambios | Alto | sin cambios |
| TARGET | Sin cambios | — | sin cambios |

### 1.2 Datos del crédito solicitado

| Variable | Estado | Sensible | Nota |
|---|---|---|---|
| NAME_CONTRACT_TYPE | Sin cambios | — | sin cambios |
| AMT_CREDIT | Sin cambios | Alto | sin cambios |
| AMT_ANNUITY | Transformada | Alto | 12 nulos imputados con la mediana (sección 2.8 del notebook) |
| AMT_GOODS_PRICE | Transformada | — | 278 nulos imputados con la mediana (sección 2.8) |

### 1.3 Demográficos

| Variable | Estado | Sensible | Nota |
|---|---|---|---|
| CODE_GENDER | Transformada | Alto | 4 filas con "XNA" eliminadas del dataset (sección 2.4) |
| DAYS_BIRTH | Sin cambios | Alto | sin cambios |
| CNT_CHILDREN | Sin cambios | Medio | sin cambios |
| CNT_FAM_MEMBERS | Transformada | Medio | 2 nulos imputados con la mediana (sección 2.8) |
| NAME_FAMILY_STATUS | Sin cambios | Medio | sin cambios |
| NAME_TYPE_SUITE | Transformada | — | 1,292 nulos imputados como "Sin especificar" (sección 2.6) |

### 1.4 Socioeconómicos

| Variable | Estado | Sensible | Nota |
|---|---|---|---|
| AMT_INCOME_TOTAL | Transformada | Alto | winsorizado al percentil 99 (sección 2.10), outlier de 117M ya no existe, valores altos quedan acotados |
| NAME_INCOME_TYPE | Sin cambios | Medio | sin cambios, se conservan categorías minoritarias (Unemployed, Student, etc.), decisión documentada en sección 2.11 |
| NAME_EDUCATION_TYPE | Sin cambios | Medio | sin cambios |
| OCCUPATION_TYPE | Transformada | Medio | 96,391 nulos (31.4%) imputados como "Sin especificar" (sección 2.6) |
| ORGANIZATION_TYPE | Transformada | Medio | "XNA" renombrado a "Sin organización" (sección 2.5) |
| DAYS_EMPLOYED | Transformada | Alto | valor centinela 365243 reemplazado por nulo (sección 2.3), sigue teniendo nulos intencionales |

### 1.5 Vivienda / patrimonio

| Variable | Estado | Sensible | Nota |
|---|---|---|---|
| FLAG_OWN_CAR | Sin cambios | Medio | sin cambios |
| FLAG_OWN_REALTY | Sin cambios | Medio | sin cambios |
| OWN_CAR_AGE | Sin cambios | — | sin tocar, nulo estructural (no tiene auto), no imputado a propósito (sección 2.9) |
| NAME_HOUSING_TYPE | Sin cambios | Medio | sin cambios |
| 47 columnas APARTMENTS_*, BASEMENTAREA_*, COMMONAREA_*, etc. (variantes _AVG/_MODE/_MEDI) | Eliminada | — | eliminadas del dataset (sección 2.1), 50-70% nulas, secundarias al caso de negocio. Siguen disponibles en raw.* dentro de la BD si se necesitan después |

### 1.6 Contacto y verificación de dirección

| Variable | Estado | Sensible | Nota |
|---|---|---|---|
| FLAG_MOBIL, FLAG_EMP_PHONE, FLAG_WORK_PHONE, FLAG_CONT_MOBILE, FLAG_PHONE, FLAG_EMAIL | Sin cambios | Alto | sin cambios, 0 nulos, valores correctos (verificado en sección 1.2 del notebook) |
| DAYS_LAST_PHONE_CHANGE | Transformada | — | 1 nulo imputado con la mediana (sección 2.8) |
| REG_REGION_NOT_LIVE_REGION, REG_REGION_NOT_WORK_REGION, LIVE_REGION_NOT_WORK_REGION | Sin cambios | Medio | sin cambios |
| REG_CITY_NOT_LIVE_CITY, REG_CITY_NOT_WORK_CITY, LIVE_CITY_NOT_WORK_CITY | Sin cambios | Medio | sin cambios |
| REGION_POPULATION_RELATIVE | Sin cambios | — | sin cambios |
| REGION_RATING_CLIENT, REGION_RATING_CLIENT_W_CITY | Sin cambios | — | sin cambios |
| DAYS_REGISTRATION | Sin cambios | — | sin cambios |
| DAYS_ID_PUBLISH | Sin cambios | Alto | sin cambios |

### 1.7 Scoring externo

| Variable | Estado | Sensible | Nota |
|---|---|---|---|
| EXT_SOURCE_1 | Sin cambios | Alto | sin cambios en el valor, sigue con 56.4% de nulos intencionalmente (no imputado, sección 2.2) |
| EXT_SOURCE_2 | Sin cambios | Alto | sin cambios en el valor, 0.21% nulos, no imputado |
| EXT_SOURCE_3 | Sin cambios | Alto | sin cambios en el valor, 19.8% nulos, no imputado |

### 1.8 Círculo social

| Variable | Estado | Sensible | Nota |
|---|---|---|---|
| OBS_30_CNT_SOCIAL_CIRCLE, DEF_30_CNT_SOCIAL_CIRCLE, OBS_60_CNT_SOCIAL_CIRCLE, DEF_60_CNT_SOCIAL_CIRCLE | Transformada | Medio | 0.33% nulos imputados con la mediana (sección 2.8) |

### 1.9 Contexto de la solicitud

| Variable | Estado | Sensible | Nota |
|---|---|---|---|
| WEEKDAY_APPR_PROCESS_START, HOUR_APPR_PROCESS_START | Sin cambios | — | sin cambios |

### 1.10 Documentos presentados

| Variable | Estado | Sensible | Nota |
|---|---|---|---|
| FLAG_DOCUMENT_2 … FLAG_DOCUMENT_21 (20 columnas) | Sin cambios | — | sin cambios, 0 nulos, valores correctos. Ojo: 8 de estas son casi constantes (>99.9% en un solo valor), candidatas a excluir en selección de variables del modelo (no se eliminan en esta etapa) |

### 1.11 Consultas previas a bureau

| Variable | Estado | Sensible | Nota |
|---|---|---|---|
| AMT_REQ_CREDIT_BUREAU_HOUR/DAY/WEEK/MON/QRT/YEAR (6 columnas) | Transformada | — | 13.5% nulos imputados con 0 (interpretados como "sin consultas registradas", sección 2.7) |

### 1.12 Variables nuevas (derivadas en la limpieza)

| Variable | Tipo | Descripción | Por qué se creó | Sensible |
|---|---|---|---|---|
| TIENE_EXT_SOURCE_1 | flag (0/1) | 1 si EXT_SOURCE_1 no es nulo | No se imputó el nulo de EXT_SOURCE_1 (borraría la señal de "sin historial externo"). El flag deja esa señal explícita como feature propia, en vez de depender de que el modelo infiera algo del NaN | — |
| TIENE_EXT_SOURCE_2 | flag (0/1) | 1 si EXT_SOURCE_2 no es nulo | Mismo motivo que TIENE_EXT_SOURCE_1 | — |
| TIENE_EXT_SOURCE_3 | flag (0/1) | 1 si EXT_SOURCE_3 no es nulo | Mismo motivo que TIENE_EXT_SOURCE_1 | — |
| DAYS_EMPLOYED_ANOM | flag (0/1) | 1 si el valor original era el centinela 365243 (cliente sin empleo actual) | El 365243 se reemplazó por NaN (sección 2.3) porque no es un número de días válido. Pero ese valor no era ruido: identificaba específicamente pensionados/desempleados. El flag rescata esa distinción antes de que se pierda al convertir a NaN | — |
| TIENE_HISTORIAL_BUREAU | flag (0/1) | 1 si el SK_ID_CURR aparece en bureau_clean.csv | Es el KPI central del caso de negocio (ver guia_proyecto_home_credit.md sección 1, KPI "% reducción de exclusión financiera"). Sin esta columna calculada, habría que rehacer el cruce con bureau cada vez que se necesite medir inclusión financiera | — |

---

## 2. bureau_clean.csv (18 columnas, de las 17 originales)

| Variable | Estado | Sensible | Nota |
|---|---|---|---|
| SK_ID_CURR, SK_ID_BUREAU | Sin cambios | Alto | sin cambios |
| CREDIT_ACTIVE, CREDIT_CURRENCY, CREDIT_TYPE | Sin cambios | Alto/— | sin cambios |
| DAYS_CREDIT, DAYS_CREDIT_ENDDATE, DAYS_ENDDATE_FACT, DAYS_CREDIT_UPDATE | Sin cambios | — | sin cambios, nulos originales (6.1%-36.9%) se dejan tal cual, son esperables (créditos aún activos no tienen fecha de cierre, etc.) |
| CREDIT_DAY_OVERDUE | Sin cambios | Alto | sin cambios |
| AMT_CREDIT_MAX_OVERDUE | Sin cambios | Alto | sin cambios, 65.5% nulos esperables, no imputado |
| CNT_CREDIT_PROLONG | Sin cambios | — | sin cambios |
| AMT_CREDIT_SUM | Sin cambios | Alto | sin cambios |
| AMT_CREDIT_SUM_DEBT | Sin cambios | Alto | valor original SIN tocar (incluye negativos), ver DEBT_NEGATIVA_FLAG |
| AMT_CREDIT_SUM_LIMIT | Sin cambios | Alto | sin cambios, 34.5% nulos esperables |
| AMT_CREDIT_SUM_OVERDUE | Sin cambios | Alto | sin cambios |
| AMT_ANNUITY | Sin cambios | Alto | sin cambios, 71.5% nulos esperables, no imputado |

### Variable nueva

| Variable | Tipo | Descripción | Sensible |
|---|---|---|---|
| DEBT_NEGATIVA_FLAG | flag (0/1) | 1 si AMT_CREDIT_SUM_DEBT es negativo (8,418 filas). Home Credit no documenta qué significa un valor negativo en esta columna, se marca en vez de eliminar o imputar, para no descartar información sin evidencia de que sea un error | — |

---

## 3. Nulos que siguen existiendo (intencionalmente)

Tras la limpieza, solo quedan nulos donde la ausencia de dato es informativa y se decidió no imputar:

| Variable | % nulos | Por qué se deja así |
|---|---|---|
| OWN_CAR_AGE | 66.0% | Estructural, cliente no tiene auto (ya capturado en FLAG_OWN_CAR) |
| EXT_SOURCE_1 | 56.4% | Imputar borraría la señal de "sin historial externo" |
| EXT_SOURCE_3 | 19.8% | Igual que EXT_SOURCE_1 |
| DAYS_EMPLOYED | 18.0% | Cliente sin empleo actual (ver DAYS_EMPLOYED_ANOM) |
| EXT_SOURCE_2 | 0.2% | Igual que EXT_SOURCE_1 |

En bureau_clean.csv, los nulos de montos (AMT_ANNUITY 71.5%, AMT_CREDIT_MAX_OVERDUE 65.5%, etc.) también se dejan sin imputar por ser esperables según el tipo de crédito reportado.

Modelos basados en árboles (XGBoost, LightGBM) manejan estos nulos de forma nativa, sin necesidad de imputación adicional antes de entrenar.
