# Guía Proyecto: Home Credit + Seguridad de Datos (DS3031)

## 1. Caso de negocio

**Empresa ficticia**: fintech tipo "CrediFácil", otorga microcréditos a personas sin historial bancario tradicional (informales), usando modelo de scoring alternativo.

**Problema que resuelve**: bancos tradicionales rechazan informales por falta de historial. CrediFácil usa data alternativa (empleo, ingresos declarados, historial en bureau) para evaluar riesgo y dar acceso a crédito.

**KPIs/OKRs** (la rúbrica pide medir valor objetivamente):
- Tasa de aprobación (% solicitudes aceptadas)
- Tasa de default proyectada (del modelo, vs TARGET real)
- Tiempo promedio de decisión (ej: <5 min vs banco tradicional días)
- % reducción de exclusión financiera (comparar aprobados sin historial bureau vs con historial)

## 2. Dataset

Fuente: [Home Credit Default Risk (Kaggle)](https://www.kaggle.com/c/home-credit-default-risk/data). 8 tablas relacionadas por SK_ID_CURR (cliente) y SK_ID_PREV/SK_ID_BUREAU (créditos previos). Diccionario completo en HomeCredit_columns_description.csv (220 variables).

### 2.1 Tabla central: application_train.csv / application_test.csv

1 fila = 1 solicitud de crédito. train: 307,511 filas, 122 columnas (incluye TARGET). test: 48,744 filas, 121 columnas (sin TARGET, es lo que se predice).

| Grupo | Variables clave | Descripción |
|---|---|---|
| Identificador | SK_ID_CURR | ID único del cliente/solicitud |
| **Target** | TARGET | 1 = tuvo atraso >X días en primeras Y cuotas, 0 = pagó bien. Solo en train |
| Datos del crédito | NAME_CONTRACT_TYPE, AMT_CREDIT, AMT_ANNUITY, AMT_GOODS_PRICE | tipo de préstamo (cash/revolving), monto, cuota, precio del bien |
| Demográficos | CODE_GENDER, CNT_CHILDREN, CNT_FAM_MEMBERS, NAME_FAMILY_STATUS, DAYS_BIRTH | género, hijos, estado civil, edad (en días negativos desde hoy) |
| Socioeconómicos | AMT_INCOME_TOTAL, NAME_INCOME_TYPE, NAME_EDUCATION_TYPE, OCCUPATION_TYPE, ORGANIZATION_TYPE, DAYS_EMPLOYED | ingreso, tipo empleo, educación, antigüedad laboral, **clave para caso "informales"** |
| Vivienda/activos | FLAG_OWN_CAR, FLAG_OWN_REALTY, NAME_HOUSING_TYPE, OWN_CAR_AGE, bloque APARTMENTS_*/BASEMENTAREA_*/etc. (47 cols normalizadas sobre el edificio donde vive) | patrimonio, condición de vivienda |
| Contacto/dirección | FLAG_MOBIL, FLAG_EMAIL, FLAG_PHONE, REG_REGION_NOT_LIVE_REGION, REG_CITY_NOT_LIVE_CITY, etc. | qué canales dio, si dirección registrada ≠ dirección real (señal de riesgo) |
| Scoring externo | EXT_SOURCE_1/2/3 | scores normalizados de otras fuentes (bureaus externos), variables más predictivas del dataset |
| Círculo social | OBS_30/60_CNT_SOCIAL_CIRCLE, DEF_30/60_CNT_SOCIAL_CIRCLE | cuántos contactos del cliente tuvieron default, dato sensible/controversial (usa red social como proxy de riesgo) |
| Documentos | FLAG_DOCUMENT_2 … FLAG_DOCUMENT_21 | qué documentos presentó (flags binarios) |
| Consultas bureau | AMT_REQ_CREDIT_BUREAU_HOUR/DAY/WEEK/MON/QRT/YEAR | cuántas veces consultaron su historial en bureau antes de esta solicitud |

### 2.2 Tablas satélite (historial, opcional para enriquecer, no obligatorio)

| Tabla | Filas | Grano | Qué aporta |
|---|---|---|---|
| bureau.csv | 1.72M | 1 crédito externo (bureau) por fila, join por SK_ID_CURR | historial crediticio en otras entidades: CREDIT_ACTIVE, AMT_CREDIT_SUM, AMT_CREDIT_SUM_DEBT, CREDIT_DAY_OVERDUE, CREDIT_TYPE |
| bureau_balance.csv | 27.3M | 1 mes de un crédito bureau, join por SK_ID_BUREAU | STATUS mensual (al día, DPD 1-30, 31-60...120+, cerrado) |
| previous_application.csv | 1.67M | 1 solicitud previa en Home Credit, join por SK_ID_CURR | NAME_CONTRACT_STATUS (aprobado/rechazado/cancelado), CODE_REJECT_REASON, montos previos |
| POS_CASH_balance.csv | 10.0M | 1 mes de un crédito POS/cash previo | SK_DPD (días de atraso), cuotas restantes |
| credit_card_balance.csv | 3.84M | 1 mes de una tarjeta de crédito previa | balance, límite, retiros de cajero, pagos |
| installments_payments.csv | 13.6M | 1 cuota pagada/programada | monto programado vs pagado, fecha programada vs real |

Relación: application 1:N previous_application 1:N (POS_CASH_balance, credit_card_balance, installments_payments); application 1:N bureau 1:N bureau_balance.

**Para el proyecto**: usar application_train.csv como base obligatoria (ya trae TARGET y variables suficientes para scoring + caso de negocio). bureau.csv es el complemento natural si se quiere mostrar "historial externo" en el dashboard/informe, no hace falta tocar las tablas de mayor volumen (bureau_balance, installments_payments, etc.) salvo que sobre tiempo.

### 2.3 Variables sensibles (mapeo directo a la sección 4 de seguridad)

| Categoría | Variables | Tratamiento sugerido |
|---|---|---|
| PII directa/cuasi-identificador | SK_ID_CURR, DAYS_BIRTH, CODE_GENDER, dirección (REGION_*, REG_CITY_*) | cifrado columna (AES-256) o pseudonimización |
| Financiera sensible | AMT_INCOME_TOTAL, AMT_CREDIT, AMT_ANNUITY, todo bureau.csv (deudas externas) | cifrado en reposo, acceso solo rol analista/admin |
| Socioeconómica/discriminación potencial | NAME_EDUCATION_TYPE, OCCUPATION_TYPE, NAME_HOUSING_TYPE, OBS/DEF_*_SOCIAL_CIRCLE | ojo con sesgo/discriminación indirecta si el modelo las pondera fuerte, mencionar en informe (ética del scoring) |
| Comportamiento/histórico pago | installments_payments, POS_CASH_balance, credit_card_balance (SK_DPD) | logs de auditoría si se consultan, retención limitada |

- Dataset adicional sugerido fuera de Kaggle: contexto Perú (ej. INEI empleo informal, o tasas SBS) para justificar el caso de negocio local, no necesita ser grande, solo contexto/narrativa en el informe

## 3. Arquitectura técnica (requerimiento: DB + front + backend)

- **Backend**: API simple (Flask/FastAPI/Node), endpoint recibe solicitud de crédito, guarda en BD, corre modelo (o mock de modelo) de scoring, devuelve decisión
- **Base de datos**: Postgres/MySQL/SQLite: tabla solicitudes (datos del aplicante), tabla usuarios_sistema (analistas con roles), tabla logs_auditoria
- **Frontend**: mínimo, formulario de solicitud + dashboard analista (ver solicitudes, aprobar/rechazar). No necesita ser detallado, solo funcional (lo aclara el PDF)

## 4. Seguridad: datos en reposo y tránsito

- **Encriptación en reposo**: campos sensibles (ingreso, tipo de empleo, SK_ID_CURR como identificador) cifrados en BD (AES-256 a nivel columna, o cifrado de disco completo si se simplifica)
- **Hashing**: contraseñas de analistas con bcrypt/argon2
- **Transporte**: HTTPS/TLS entre front-backend, certificado autofirmado o CA propia (requerimiento explícito del PDF)
- **Gestión de accesos**: roles: analista (ve solicitudes asignadas), admin (ve todo + logs), sistema (solo escribe). RBAC simple en backend
- **Logs de auditoría**: cada acceso/modificación a datos de solicitante queda registrado (quién, cuándo, qué campo)

## 5. Estrategias de uso seguro

- Política de acceso mínimo necesario (analista no ve historial completo, solo lo necesario para decisión)
- Capacitación básica del equipo (documentar en el informe: qué política de manejo de datos seguirían empleados reales)
- Procedimiento de eliminación/anonimización de datos tras período de retención (Ley 29733 lo exige)

## 6. Backup / continuidad

- Backup periódico de BD (ej. diario, script simple o snapshot)
- Justificar RTO/RPO básico (aunque sea teórico: "backup diario, pérdida máxima aceptable 24h")

## 7. Plan de respuesta a incidentes

Estructura básica a incluir en el informe:
1. Detección (cómo se detectaría una fuga: alertas en logs)
2. Contención (aislar el sistema afectado)
3. Notificación (a usuarios afectados + autoridad si aplica, plazo según ley)
4. Recuperación (restaurar desde backup)
5. Post-mortem (lecciones aprendidas)

## 8. Recomendaciones futuras (lo que no se implementará ahora)

Ejemplos a listar y justificar: MFA para analistas, cifrado homomórfico para scoring sin exponer data cruda, auditoría externa anual, tokenización de identificadores, WAF.

## 9. Informe escrito: estructura sugerida

1. Introducción + motivación (por qué Home Credit, caso de negocio)
2. Trasfondo teórico (qué es alt-data scoring, marco legal Perú)
3. Requerimientos funcionales
4. Requerimientos de seguridad (todo lo de arriba)
5. Diseño (arquitectura, diagrama simple front-back-DB)
6. Implementación (qué se construyó realmente)
7. Lecciones aprendidas + retrospectiva de equipo
8. Recomendaciones futuras

→ Alojar en GitHub Pages o Notion (pide el PDF)

## 10. Orden sugerido de trabajo

1. Validar dataset + caso con el profesor (requisito explícito)
2. Explorar application_train.csv, definir features sensibles
3. Diseñar esquema de BD + arquitectura
4. Backend + BD funcionando (CRUD solicitudes)
5. Meter capa de seguridad (cifrado, roles, logs, TLS)
6. Front mínimo conectado
7. Escribir informe en paralelo (no dejar para el final)

## 11. Qué hay implementado en este repo

| Carpeta | Contenido |
|---|---|
| `notebooks/` | EDA y limpieza (`limpieza_datos.ipynb`), genera los csv limpios |
| `dataset/` | Los 2 csv limpios (se descargan del Drive, no van a git) |
| `diccionario_datos/` | Diccionario de la data cruda y de la limpia |
| `pipeline/` | csv → Postgres: `raw` (copia fiel), `core` (cifrado con pgcrypto) y el scorecard transparente (`core.scores`). Ver `pipeline/README.md` |
| `web/` | Panel del cliente (React + D3 + FastAPI): score explicado, sugerencias, simulador, comparación anónima, login seguro, auditoría y TLS con CA propia. Ver `web/README.md` |
| `docs/` | Informe escrito del proyecto (GitHub Pages). Ver sección siguiente |

Orden para levantar todo: descargar los csv → `pipeline/README.md` (pasos 1 a 3) → `web/README.md`.

Resultados del scorecard (con los datos limpios): AUC 0.725 sin variables sensibles vs 0.739 de un modelo tradicional que sí las usa; a igual tasa de aprobación global (75.1%), aprueba al 67.3% de los clientes sin historial en bureau vs 65.0% (KPI de reducción de exclusión financiera de la sección 1). Fuente de verdad de estas cifras: `core.modelo_scorecard` (`definicion -> 'comparacion'`).

## 12. Informe escrito y demo (GitHub Pages)

Publicado en **https://jyns123.github.io/ETIKE/**:

- `/`: el informe completo (motivación, trasfondo teórico, requerimientos, diseño, implementación, plan de respuesta a incidentes, recomendaciones futuras, planificación y retrospectiva). Fuente: [`docs/index.md`](docs/index.md) (Jekyll).
- `/demo/`: versión estática del panel, sin backend: respuestas reales del backend exportadas para las cuentas demo (contraseña `demo`). Ver `web/README.md`, "Demo estática".

Lo publica el workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) en cada push a `main` (en un PR solo compila). En `Settings` → `Pages` la fuente debe ser **GitHub Actions**.
