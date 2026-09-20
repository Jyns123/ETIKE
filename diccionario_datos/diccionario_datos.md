# Diccionario de Datos: Home Credit Default Risk

Alcance: solo las tablas que vas a usar (application_train.csv, application_test.csv, bureau.csv). Las otras 5 tablas (bureau_balance, previous_application, POS_CASH_balance, credit_card_balance, installments_payments) quedan fuera de scope por ahora, ver guia_proyecto_home_credit.md sección 2.2 si luego se agregan.

Fuente original: HomeCredit_columns_description.csv (Kaggle).

Columna **Sensible**: Alto = dato personal/financiero directo. Medio = podría generar sesgo/discriminación por proxy. — = no sensible.

### ¿Qué es "discriminación por proxy"? (por qué hay columnas marcadas como Medio)

Proxy = sustituto indirecto. El modelo no usa la variable protegida directamente, pero usa otra variable correlacionada con ella y termina con el mismo efecto discriminatorio.

Ejemplo con este dataset: no le das al modelo CODE_GENDER porque discriminar por género está mal. Pero sí le dejas OCCUPATION_TYPE. Si en la data histórica ciertas ocupaciones están dominadas por un género (ej. "Cleaning staff" mayoría mujeres), el modelo aprende "esa ocupación → más riesgo" y rechaza más a esa ocupación → en la práctica rechaza más mujeres, sin que nunca le hayas dado el género como input. OCCUPATION_TYPE actuó de proxy de CODE_GENDER.

Mismo patrón: NAME_HOUSING_TYPE/FLAG_OWN_CAR/FLAG_OWN_REALTY → proxy de nivel socioeconómico. OBS/DEF_*_SOCIAL_CIRCLE → proxy de en qué entorno/barrio vives. Por eso están marcadas como sensibilidad Medio aunque no sean datos personales identificables por sí solas.

Implicación práctica: no basta con sacar las variables "obvias" (género, edad) del modelo, hay que revisar feature_importance del modelo entrenado y ver si alguna variable marcada como Medio está cargando con mucho peso, porque puede estar reproduciendo el mismo sesgo por la puerta trasera. Buen punto pa la sección de ética del informe.

---

## 1. application_train.csv / application_test.csv

1 fila = 1 solicitud de crédito de 1 cliente. train = 307,511 filas (con TARGET). test = 48,744 filas (sin TARGET, es lo que se predice). Llave: SK_ID_CURR.

### 1.1 Identificador y variable objetivo

| Variable | Tipo | Descripción | Sensible |
|---|---|---|---|
| SK_ID_CURR | ID | Identificador único del cliente/solicitud | Alto |
| TARGET | binaria (solo train) | 1 = tuvo atraso >X días en al menos 1 de las primeras Y cuotas (default). 0 = pagó normal | — |

### 1.2 Datos del crédito solicitado

| Variable | Tipo | Descripción | Sensible |
|---|---|---|---|
| NAME_CONTRACT_TYPE | categórica | Tipo de préstamo: Cash loans o Revolving loans | — |
| AMT_CREDIT | numérica | Monto del crédito solicitado | Alto |
| AMT_ANNUITY | numérica | Cuota (anualidad) del préstamo | Alto |
| AMT_GOODS_PRICE | numérica | Precio del bien que se financia (en créditos de consumo) | — |

### 1.3 Demográficos

| Variable | Tipo | Descripción | Sensible |
|---|---|---|---|
| CODE_GENDER | categórica | Género del cliente | Alto |
| DAYS_BIRTH | numérica (negativa) | Edad en días respecto a la fecha de solicitud (dividir /-365 = edad en años) | Alto |
| CNT_CHILDREN | numérica | Número de hijos | Medio |
| CNT_FAM_MEMBERS | numérica | Número de miembros de familia | Medio |
| NAME_FAMILY_STATUS | categórica | Estado civil | Medio |
| NAME_TYPE_SUITE | categórica | Quién acompañó al cliente al solicitar | — |

> **DAYS_BIRTH, nota (anonimización):** en vez de guardar la fecha de nacimiento real, se guarda una duración (días desde que nació hasta el día de esta solicitud). Esto es anonimización real, no solo cosmética: se pierde la fecha calendario absoluta (no se puede saber en qué año nació sin saber también cuándo solicitó, dato que tampoco está como fecha real), y cada fila usa su propio "día 0" (el día en que ESA persona solicitó), así que dos personas con el mismo DAYS_BIRTH pueden haber nacido en años distintos. La edad relativa se conserva (útil para el modelo), pero se rompe el vínculo directo con una fecha real identificable. Mismo principio aplica a DAYS_EMPLOYED, DAYS_REGISTRATION, DAYS_ID_PUBLISH y DAYS_LAST_PHONE_CHANGE.

### 1.4 Socioeconómicos (clave para el caso "informales")

| Variable | Tipo | Descripción | Sensible |
|---|---|---|---|
| AMT_INCOME_TOTAL | numérica | Ingreso total declarado del cliente | Alto |
| NAME_INCOME_TYPE | categórica | Tipo de ingreso: Working, Businessman, Maternity leave, Pensioner, Student, etc. | Medio |
| NAME_EDUCATION_TYPE | categórica | Nivel educativo máximo alcanzado | Medio |
| OCCUPATION_TYPE | categórica | Ocupación del cliente | Medio |
| ORGANIZATION_TYPE | categórica | Tipo de organización donde trabaja | Medio |
| DAYS_EMPLOYED | numérica (negativa) | Días antes de la solicitud en que empezó su empleo actual (antigüedad laboral) | Alto |

### 1.5 Vivienda / patrimonio

| Variable | Tipo | Descripción | Sensible |
|---|---|---|---|
| FLAG_OWN_CAR | flag (Y/N) | Si tiene auto propio | Medio |
| FLAG_OWN_REALTY | flag (Y/N) | Si tiene casa/depto propio | Medio |
| OWN_CAR_AGE | numérica | Antigüedad del auto | — |
| NAME_HOUSING_TYPE | categórica | Situación de vivienda: alquila, vive con padres, propia, etc. | Medio |
| APARTMENTS_AVG, BASEMENTAREA_AVG, YEARS_BEGINEXPLUATATION_AVG, YEARS_BUILD_AVG, COMMONAREA_AVG, ELEVATORS_AVG, ENTRANCES_AVG, FLOORSMAX_AVG, FLOORSMIN_AVG, LANDAREA_AVG, LIVINGAPARTMENTS_AVG, LIVINGAREA_AVG, NONLIVINGAPARTMENTS_AVG, NONLIVINGAREA_AVG (14 variables, cada una también existe como _MODE y _MEDI → 42 columnas), más FONDKAPREMONT_MODE, HOUSETYPE_MODE, TOTALAREA_MODE, WALLSMATERIAL_MODE, EMERGENCYSTATE_MODE (5 columnas, sin variantes) → **47 columnas en total** | numérica normalizada | Info normalizada del edificio donde vive el cliente: tamaño depto, área común, antigüedad edificio, N° ascensores, N° pisos, estado del edificio | Medio |

### 1.6 Contacto y verificación de dirección

| Variable | Tipo | Descripción | Sensible |
|---|---|---|---|
| FLAG_MOBIL, FLAG_EMP_PHONE, FLAG_WORK_PHONE, FLAG_CONT_MOBILE, FLAG_PHONE, FLAG_EMAIL | flags (0/1) | Qué canales de contacto proporcionó el cliente | Alto |
| DAYS_LAST_PHONE_CHANGE | numérica | Días desde que cambió de teléfono antes de la solicitud | — |
| REG_REGION_NOT_LIVE_REGION, REG_REGION_NOT_WORK_REGION, LIVE_REGION_NOT_WORK_REGION | flags | Si dirección registrada ≠ dirección de residencia/trabajo, a nivel región | Medio |
| REG_CITY_NOT_LIVE_CITY, REG_CITY_NOT_WORK_CITY, LIVE_CITY_NOT_WORK_CITY | flags | Igual que arriba pero a nivel ciudad | Medio |
| REGION_POPULATION_RELATIVE | numérica normalizada | Densidad poblacional de la región donde vive | — |
| REGION_RATING_CLIENT, REGION_RATING_CLIENT_W_CITY | ordinal (1,2,3) | Calificación interna de Home Credit sobre la región donde vive | — |
| DAYS_REGISTRATION | numérica | Días desde que cambió su registro antes de la solicitud | — |
| DAYS_ID_PUBLISH | numérica | Días desde que cambió su documento de identidad antes de la solicitud | Alto |

> **DAYS_REGISTRATION, nota:** Kaggle no define exacto qué "registro" es (ni la doc oficial lo aclara). Interpretación razonable: cuándo el cliente actualizó su domicilio/dirección oficial registrada (tipo cambio de dirección en DNI/RENIEC). Mismo formato negativo que DAYS_BIRTH (días antes de la solicitud). Distinguir de sus primas: DAYS_ID_PUBLISH = cambio de documento de identidad, DAYS_LAST_PHONE_CHANGE = cambio de teléfono. Las tres miden "hace cuánto actualizó tal dato" como proxy de estabilidad del cliente (cambios muy recientes/frecuentes = señal de inestabilidad; cambio antiguo = estabilidad, lleva tiempo en el mismo sitio).

### 1.7 Scoring externo (variables más predictivas del dataset)

| Variable | Tipo | Descripción | Sensible |
|---|---|---|---|
| EXT_SOURCE_1 | numérica normalizada (0-1) | Score de una fuente externa (bureau u otra entidad). Falta en ~56% de los casos | Alto |
| EXT_SOURCE_2 | numérica normalizada (0-1) | Score de otra fuente externa | Alto |
| EXT_SOURCE_3 | numérica normalizada (0-1) | Score de otra fuente externa más | Alto |

> **Nota:** Kaggle no dice qué miden exacto ni de qué entidad vienen (info confidencial de esos proveedores). Lo que sí se sabe por análisis de la comunidad: están correlacionados NEGATIVAMENTE con TARGET → mientras más alto el score, MENOR probabilidad de default. Funcionan como "score de confianza/confiabilidad" del cliente: cerca de 1 = confiable, cerca de 0 = riesgoso. Son, empíricamente, las 3 variables más predictivas de todo el dataset, más que cualquier variable propia de Home Credit.
>
> Tensión pa el caso de negocio: el score más predictivo depende de fuentes externas tipo bureau tradicional, justo lo que el cliente "informal" no tiene (por eso falta tanto, ~56% en EXT_SOURCE_1). Si el modelo se apoya mucho en estas 3 variables, termina replicando el mismo problema de exclusión que el proyecto busca resolver.

### 1.8 Círculo social (dato éticamente delicado)

| Variable | Tipo | Descripción | Sensible |
|---|---|---|---|
| OBS_30_CNT_SOCIAL_CIRCLE | numérica | Cuántos contactos cercanos del cliente son observables (ventana 30 días) | Medio |
| DEF_30_CNT_SOCIAL_CIRCLE | numérica | De esos contactos, cuántos cayeron en default (30 días atraso) | Medio |
| OBS_60_CNT_SOCIAL_CIRCLE | numérica | Igual que arriba, ventana 60 días | Medio |
| DEF_60_CNT_SOCIAL_CIRCLE | numérica | Igual que arriba, ventana 60 días | Medio |

### 1.9 Contexto de la solicitud

| Variable | Tipo | Descripción | Sensible |
|---|---|---|---|
| WEEKDAY_APPR_PROCESS_START | categórica | Día de la semana en que aplicó | — |
| HOUR_APPR_PROCESS_START | numérica | Hora aproximada en que aplicó | — |

### 1.10 Documentos presentados

| Variable | Tipo | Descripción | Sensible |
|---|---|---|---|
| FLAG_DOCUMENT_2 … FLAG_DOCUMENT_21 (20 columnas) | flags (0/1) | Si el cliente presentó cada documento específico (no se sabe cuál es cuál, están anonimizados) | — |

### 1.11 Consultas previas a bureau de crédito

| Variable | Tipo | Descripción | Sensible |
|---|---|---|---|
| AMT_REQ_CREDIT_BUREAU_HOUR | numérica | N° consultas al bureau sobre este cliente, 1 hora antes de la solicitud | — |
| AMT_REQ_CREDIT_BUREAU_DAY | numérica | Ídem, 1 día antes | — |
| AMT_REQ_CREDIT_BUREAU_WEEK | numérica | Ídem, 1 semana antes | — |
| AMT_REQ_CREDIT_BUREAU_MON | numérica | Ídem, 1 mes antes | — |
| AMT_REQ_CREDIT_BUREAU_QRT | numérica | Ídem, 3 meses antes | — |
| AMT_REQ_CREDIT_BUREAU_YEAR | numérica | Ídem, 1 año antes | — |

> **Nota:** cada vez que una entidad financiera evalúa a un cliente, consulta su historial en el buró de crédito, y esa consulta queda registrada. Estas 6 columnas cuentan cuántas consultas hubo sobre este cliente, agrupadas por qué tan cerca en el tiempo fueron respecto a esta solicitud (última hora, último día, semana, mes, trimestre, año). Ejemplo: AMT_REQ_CREDIT_BUREAU_MON = 3 significa que en el mes previo a esta solicitud, 3 entidades distintas ya habían consultado su historial. Muchas consultas seguidas en poco tiempo suele ser señal de alerta de riesgo (cliente pidiendo crédito en varios lados a la vez, posible necesidad urgente de plata).

---

## 2. bureau.csv

1 fila = 1 crédito que el cliente tiene/tuvo en **otra** entidad financiera (no Home Credit), reportado al buró de crédito. Un cliente puede tener 0, 1 o varias filas. Llaves: SK_ID_CURR (join con application), SK_ID_BUREAU (único por crédito externo).

| Variable | Tipo | Descripción | Sensible |
|---|---|---|---|
| SK_ID_CURR | ID | Cliente al que pertenece este crédito externo (join con application) | Alto |
| SK_ID_BUREAU | ID | Identificador único de este crédito externo | Alto |
| CREDIT_ACTIVE | categórica | Estado del crédito: Active, Closed, Sold, Bad debt | Alto |
| CREDIT_CURRENCY | categórica | Moneda del crédito (recodificada) | — |
| CREDIT_TYPE | categórica | Tipo de crédito externo: Car loan, Credit card, Consumer credit, etc. | Medio |
| DAYS_CREDIT | numérica | Días antes de esta solicitud en que se abrió el crédito externo | — |
| DAYS_CREDIT_ENDDATE | numérica | Días restantes del crédito externo (al momento de esta solicitud) | — |
| DAYS_ENDDATE_FACT | numérica | Días desde que terminó el crédito externo (solo si ya está cerrado) | — |
| DAYS_CREDIT_UPDATE | numérica | Días desde la última actualización de info de este crédito | — |
| CREDIT_DAY_OVERDUE | numérica | Días de atraso en este crédito externo, al momento de la solicitud actual | Alto |
| AMT_CREDIT_MAX_OVERDUE | numérica | Monto MÁXIMO que estuvo en mora en este crédito, hasta la fecha de esta solicitud (65.5% nulo: solo existe si alguna vez hubo mora en ese crédito) | Alto |
| CNT_CREDIT_PROLONG | numérica | Cuántas veces se prorrogó este crédito | — |
| AMT_CREDIT_SUM | numérica | Monto total de este crédito externo | Alto |
| AMT_CREDIT_SUM_DEBT | numérica | Deuda actual pendiente en este crédito externo | Alto |
| AMT_CREDIT_SUM_LIMIT | numérica | Límite de crédito (si es tarjeta) | Alto |
| AMT_CREDIT_SUM_OVERDUE | numérica | Monto actualmente vencido/en mora | Alto |
| AMT_ANNUITY | numérica | Cuota anual de este crédito externo | Alto |

---

## 3. Cómo se relacionan

```
application_train / application_test
        │
        │ SK_ID_CURR (1 cliente → 0, 1 o N créditos externos)
        ▼
     bureau.csv
```

Un cliente sin ninguna fila en bureau.csv = cliente **sin historial crediticio externo** (el "informal" del caso de negocio). Ese es el campo derivado clave: tiene_historial_bureau = EXISTS(SELECT 1 FROM bureau WHERE SK_ID_CURR = ...), ya está implementado así en pipeline/transform_core.py.

## 4. Notas prácticas para empezar a explorar

- DAYS_* vienen en negativo (relativo a la fecha de solicitud), hay que transformarlas (ej. DAYS_BIRTH / -365 = edad en años)
- DAYS_EMPLOYED tiene un valor atípico conocido: 365243 (positivo, un error de captura del dataset original, típicamente en desempleados/pensionados). Filtrar o tratar aparte
- Muchas categóricas usan XNA como "no aplica/no disponible", tratar como missing, no como categoría real
- EXT_SOURCE_1/2/3 tienen bastantes NaN, normal, no es error de carga
