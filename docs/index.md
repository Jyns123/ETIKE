# CrediFácil: Tu score, sin cajas negras

**Proyecto de Ética y Seguridad de Datos — DS3031**
Fintech ficticia de microcréditos para personas sin historial bancario tradicional, con un modelo de scoring alternativo explicable y una capa de seguridad de datos de extremo a extremo.

Repositorio: [github.com/Jyns123/ETIKE](https://github.com/Jyns123/ETIKE)

---

## Tabla de contenidos

1. [Introducción y motivación](#1-introducción-y-motivación)
2. [Trasfondo teórico](#2-trasfondo-teórico)
3. [Requerimientos funcionales](#3-requerimientos-funcionales)
4. [Requerimientos de seguridad](#4-requerimientos-de-seguridad)
5. [Diseño](#5-diseño)
6. [Implementación](#6-implementación)
7. [Plan de respuesta a incidentes](#7-plan-de-respuesta-a-incidentes)
8. [Recomendaciones futuras](#8-recomendaciones-futuras)
9. [Lecciones aprendidas y retrospectiva](#9-lecciones-aprendidas-y-retrospectiva)

---

## 1. Introducción y motivación

Los bancos tradicionales en el Perú rechazan crédito a personas sin historial bancario formal — trabajadores informales, independientes, gente que nunca tuvo una tarjeta o un préstamo a su nombre. Según cifras del INEI, la informalidad laboral en el país ronda el 70% de la fuerza laboral, lo que deja a una parte enorme de la población fuera del sistema financiero formal simplemente porque el scoring tradicional depende de datos que esa población no tiene.

**CrediFácil** es una fintech ficticia que usa *scoring alternativo*: en vez de exigir historial bancario, evalúa al solicitante con datos que sí declara (ingreso, empleo, antigüedad, historial en otras entidades si lo tiene) para decidir si es apto para un microcrédito. El problema de negocio no es solo "dar más créditos": es decidir *de forma justa y explicable* a quién se le da crédito cuando la señal más predictiva de riesgo (el historial crediticio externo) es justo la que le falta a la población que se quiere incluir.

Ese problema tiene dos caras que este proyecto aborda juntas:

- **Ética/negocio**: ¿cómo se construye un modelo que no reproduzca la exclusión financiera que se supone debe resolver?
- **Seguridad**: ¿cómo se protege la información financiera y personal de miles de solicitantes (ingreso, deudas, historial) mientras se las usa para decidir sobre su crédito?

El nombre del panel del cliente — *"Tu score, sin cajas negras"* — resume la apuesta del proyecto: el cliente no solo recibe una decisión, ve exactamente de dónde sale cada punto de su score, qué datos se usaron, cuáles no se usaron y por qué, y qué puede cambiar para mejorar.

### Caso de negocio

**Dataset base**: [Home Credit Default Risk](https://www.kaggle.com/c/home-credit-default-risk/data) (Kaggle) — 307,511 solicitudes de crédito reales, con la variable objetivo (`TARGET`: si el cliente tuvo atraso significativo) y 121 variables del solicitante (ingreso, empleo, vivienda, historial externo, etc.), más `bureau.csv` con el historial en otras entidades financieras.

**KPIs con los que se mide el valor del proyecto** (medidos, no solo declarados — ver sección 6.2):

| KPI | Resultado medido |
|---|---|
| Tasa de aprobación a igual umbral | 67.3% de aprobación entre clientes sin historial en bureau |
| Costo de la neutralidad (AUC) | 0.725 (scorecard justo) vs. 0.739 (modelo tradicional con variables sensibles) — 0.014 de diferencia |
| Reducción de exclusión financiera | +2.3 puntos porcentuales de aprobación para clientes sin historial, frente a un modelo que sí penaliza esa ausencia (67.3% vs. 65.0%) |
| Clientes procesados | 307,507 |

---

## 2. Trasfondo teórico

### 2.1 Scoring alternativo (alt-data scoring)

El scoring crediticio tradicional se basa casi enteramente en el historial de crédito previo: si nunca tuviste una tarjeta o un préstamo, no hay con qué calcular tu riesgo, y el sistema por defecto te rechaza o te da condiciones peores. El *alt-data scoring* reemplaza o complementa esa señal con datos alternativos — ingreso declarado, estabilidad laboral, antigüedad del número de contacto, comportamiento de pago en servicios no financieros — que sí están disponibles para la población no bancarizada.

El riesgo de este enfoque es reemplazar un sesgo por otro: si las variables alternativas están correlacionadas con atributos protegidos (género, edad, nivel socioeconómico), el modelo puede terminar discriminando por una puerta trasera aunque nunca reciba esos atributos como input directo. Esto se conoce como **discriminación por proxy**, y es el problema central que el diseño del scorecard de este proyecto intenta resolver explícitamente (ver sección 4 y 6.2).

### 2.2 Marco legal: Ley N.º 29733 (Ley de Protección de Datos Personales, Perú)

El Perú regula el tratamiento de datos personales — incluyendo datos financieros y crediticios — bajo la Ley N.º 29733 y su reglamento. Los principios centrales que aplican directamente a este proyecto son:

- **Consentimiento informado**: el titular debe saber qué datos se recolectan y para qué se usan.
- **Finalidad**: los datos se usan solo para el fin declarado (calcular el score y explicarlo), no se reutilizan sin autorización.
- **Proporcionalidad / minimización de datos**: no se recolecta ni se procesa más de lo necesario. Este proyecto lo lleva a nivel de implementación: por ejemplo, la fecha de nacimiento se guarda cifrada pero *nunca se descifra* en la aplicación, porque el modelo no la usa (ver sección 4.1).
- **Seguridad**: obligación de implementar medidas técnicas y organizativas razonables para proteger los datos — cifrado, control de accesos, auditoría (desarrollado en la sección 4).
- **Derechos ARCO** (Acceso, Rectificación, Cancelación, Oposición): el titular tiene derecho a saber qué se guarda de él. La sección "Tus datos" del panel del cliente implementa directamente el derecho de acceso: el cliente ve sus propios campos cifrados, puede pedir el descifrado de lo que le corresponde, y ve quién accedió a su información y cuándo.
- **Notificación de incidentes**: en caso de una fuga de datos, existe la obligación de notificar a los afectados y a la autoridad competente en un plazo razonable (ver plan de respuesta a incidentes, sección 7).

### 2.3 Discriminación por proxy

Un proxy es una variable que, sin ser el atributo protegido en sí, está tan correlacionada con él que produce el mismo efecto discriminatorio. Ejemplo concreto de este dataset: no se le da al modelo `CODE_GENDER` (género), pero si se le diera `OCCUPATION_TYPE` sin cuidado, y ciertas ocupaciones están dominadas históricamente por un género, el modelo aprendería "esa ocupación → más riesgo" y terminaría rechazando más a ese género sin haber recibido el dato directamente.

Este proyecto identificó variables de riesgo-proxy documentadas en `diccionario_datos/diccionario_datos.md` (nivel de educación → proxy de nivel socioeconómico; tipo de vivienda / posesión de auto → proxy de patrimonio; círculo social con atrasos → proxy de barrio/entorno) y las excluyó del modelo de forma explícita y justificada — no solo las variables "obvias" como género o edad, sino también sus proxies más fuertes (ver la lista completa en la sección 6.2).

---

## 3. Requerimientos funcionales

El sistema resuelve un caso de uso de seguridad y negocio real: **decidir sobre solicitudes de crédito de forma explicable, auditable y sin discriminar por variables sensibles**, con tres actores:

| Rol | Qué puede hacer |
|---|---|
| **Cliente** | Ver su score y cómo se calculó (cascada factor por factor), simular qué pasaría si cambia algo, ver un plan mínimo para ser apto, compararse de forma anónima con otros clientes, ver sus propios datos cifrados y quién accedió a ellos |
| **Analista** | Ver indicadores agregados del negocio (aprobación, aprobación sin historial, distribución por banda) y **aprobar o rechazar solicitudes individuales** viendo solo el score y un alias pseudonimizado — nunca el dato identificable ni descifrado del cliente |
| **Admin** | Todo lo del analista, más el registro completo de auditoría (quién accedió a qué, cuándo, con qué resultado) |

El flujo de datos completo — csv → base de datos cifrada → modelo entrenado → API → interfaz — está implementado y corriendo (no es un mockup): pipeline de carga y transformación, motor de scoring, backend con autenticación real, y frontend con las seis secciones descritas en la sección 6.3.

---

## 4. Requerimientos de seguridad

### 4.1 Protección de datos en reposo y en tránsito

| Medida | Cómo se implementó |
|---|---|
| **Cifrado en reposo** | Ingreso, fecha de nacimiento, deuda externa y el detalle completo del score se cifran columna por columna con `pgcrypto` (AES-256, `cipher-algo=aes256`). La base solo guarda binario ilegible sin la llave |
| **Minimización activa** | La fecha de nacimiento se guarda cifrada pero la aplicación **nunca la descifra**: el modelo no usa edad, así que no hay razón para exponerla ni siquiera al propio titular |
| **Hashing de contraseñas** | Argon2id (ganador de la Password Hashing Competition, recomendado por OWASP), con sal por cuenta y re-hash automático si cambian los parámetros de seguridad |
| **Cifrado en tránsito** | Solo HTTPS, TLS 1.2+, certificado firmado por una CA propia generada para el proyecto (ECDSA P-256, suites ECDHE+AES-GCM/ChaCha20) |
| **Sesiones** | Token aleatorio de 256 bits en cookie `__Host-`, `HttpOnly`, `Secure`, `SameSite=Strict`; en la base solo se guarda su hash SHA-256 — robar la tabla de sesiones no permite iniciar sesión con ellas. Expira a los 30 min de inactividad y a las 8 h en total |
| **Anti fuerza bruta** | Bloqueo de cuenta 15 min tras 5 intentos fallidos + límite de 10 intentos / 5 min por IP |
| **Anti enumeración de usuarios** | Mensaje de error único y verificación contra un hash de relleno cuando el usuario no existe, para que el tiempo de respuesta no delate si una cuenta existe |
| **Cabeceras de seguridad** | CSP estricta (sin `unsafe-inline`, sin CDNs externos), HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` |
| **CSRF** | `SameSite=Strict` + verificación de la cabecera `Origin` en toda petición que cambia estado |

### 4.2 Gestión de accesos y auditoría

- **RBAC** con tres roles (`cliente`, `analista`, `admin`), verificado en cada endpoint del backend.
- **Mínimo privilegio a nivel de base de datos**: la aplicación se conecta con un rol dedicado (`etike_app`) que no tiene ningún acceso al schema con los datos crudos (`raw`), solo lectura sobre columnas específicas del schema cifrado (`core`), y solo `INSERT` (nunca `UPDATE`/`DELETE`) sobre la tabla de auditoría — si alguien compromete la aplicación, no puede borrar su propio rastro.
- **Prevención de IDOR (Insecure Direct Object Reference)**: ningún endpoint del cliente recibe un identificador en la URL — el cliente que se está consultando sale siempre de la sesión autenticada, nunca de un parámetro que alguien pueda manipular. Esta garantía está verificada por una prueba automatizada que falla si algún endpoint futuro rompe esa regla (`web/backend/tests/test_idor.py`).
- **Pseudonimización**: cuando un cliente se compara con otros, o cuando un analista revisa solicitudes, los demás clientes aparecen con un alias estable (`CF-XXXX-XXXX`, HMAC-SHA256 con una llave que solo tiene el servidor) — nunca con su identificador real.
- **Auditoría completa**: cada inicio de sesión, cada lectura de datos sensibles y cada descifrado queda registrado (quién, cuándo, qué, desde qué IP, si tuvo éxito). El cliente ve su propio historial de accesos; el admin ve todo.

### 4.3 Estrategias de uso seguro de los datos

Más allá de los controles técnicos, el proyecto define políticas de manejo de datos para el equipo:

- **Acceso mínimo necesario**: un analista nunca necesita ver el ingreso o la fecha de nacimiento de un cliente para decidir sobre una solicitud — solo necesita el score y la banda de riesgo. Por eso el diseño del panel interno (sección 6.3) elimina esa posibilidad de raíz, en vez de confiar en que el analista "no debería" mirar esos datos.
- **Descifrado bajo demanda y auditado**: ningún dato sensible se descifra "por si acaso". Se descifra solo cuando el titular lo pide explícitamente (por ejemplo, ver su ingreso en la sección "Mis datos"), y esa acción queda registrada.
- **Capacitación del equipo**: en un despliegue real, todo miembro del equipo con acceso a producción (desarrolladores, analistas) firmaría un acuerdo de confidencialidad y pasaría por una inducción breve cubriendo: qué datos son sensibles y por qué, cómo reportar un incidente sospechoso, y la política de "nunca compartir credenciales ni exportar datos fuera del sistema".
- **Rotación y resguardo de llaves**: la llave de cifrado de la base de datos y las llaves de sesión/pseudonimización viven solo en variables de entorno fuera del control de versiones (nunca en el código ni en el repositorio), y el rol de aplicación está configurado para que Postgres nunca escriba esas llaves en sus logs de error.

### 4.4 Backup y continuidad

Todo repositorio de datos necesita poder recuperarse de un desastre o un ataque. Se implementó y **se probó de extremo a extremo** (no solo se documentó):

- Script de backup (`pipeline/backup_db.py`) que genera una copia completa de la base con `pg_dump` en formato comprimido, y purga automáticamente los backups de más de 7 días.
- Comando de restauración (`--restore`) que recompone la base completa con `pg_restore`.
- **Prueba real**: se generó un backup de la base completa (488.9 MB, 307,507 solicitudes + 1,465,291 registros de historial bureau), se restauró en una base nueva desde cero, y se verificó que los conteos de filas coincidieran exactamente con el original.
- **RPO estimado**: ~24 horas, corriendo el backup una vez al día (por ejemplo con `cron`). En el peor caso se pierde lo cargado en las últimas 24 h.
- **RTO estimado**: minutos, no horas — restaurar el volumen actual de datos con `pg_restore` tomó unos pocos minutos en la prueba real.

---

## 5. Diseño

### 5.1 Arquitectura

```
navegador ──HTTPS (TLS 1.2+, CA propia)──> FastAPI (backend) ──> PostgreSQL
  React + D3 + Motion                       rol etike_app          raw   (datos crudos, sin acceso desde la app)
  cookie de sesión HttpOnly                  (mínimo privilegio)     core  (cifrado con pgcrypto: solicitudes, scores)
                                                                       app   (usuarios, sesiones, auditoría)
```

Tres schemas de base de datos con responsabilidades separadas:

- **`raw`**: copia fiel de los csv originales. La aplicación web no tiene ningún acceso a este schema.
- **`core`**: los mismos datos, con las columnas sensibles cifradas y los flags de limpieza ya calculados, más el modelo de scoring y los resultados por cliente.
- **`app`**: todo lo propio de la aplicación web — usuarios, sesiones, auditoría, y las decisiones del panel interno (aprobar/rechazar).

### 5.2 Diseño de seguridad

Algoritmos y protocolos usados, y por qué:

| Necesidad | Elección | Justificación |
|---|---|---|
| Cifrado simétrico en reposo | AES-256 vía `pgp_sym_encrypt` (pgcrypto) | Estándar de la industria, cifrado a nivel de columna permite que hasta un `SELECT *` directo a la base no exponga nada en claro |
| Hash de contraseñas | Argon2id | Ganador de la Password Hashing Competition, resistente a ataques con GPU/ASIC, recomendado actualmente por OWASP por sobre bcrypt/PBKDF2 |
| Pseudonimización | HMAC-SHA256 con llave de servidor | A diferencia de un hash simple, HMAC con llave secreta hace inviable recalcular el alias sin la llave, incluso conociendo el algoritmo |
| Transporte | TLS 1.2+, CA propia, ECDSA P-256 | Cumple el requisito de certificados digitales (autofirmado/CA propia) del proyecto; ECDSA es más liviano que RSA a igual seguridad |
| Identificador de sesión | Token aleatorio de 256 bits, solo su hash en base | Un volcado de la base de sesiones no permite secuestrar sesiones activas |

### 5.3 Diseño funcional (interfaz y experiencia)

El panel del cliente tiene seis secciones pensadas para llevar de la mano a alguien sin conocimiento técnico de modelos de crédito:

1. **Tu score**: medidor visual, percentil, y "de cada 100 personas con tu score, X se atrasaron" — la interpretación de negocio del número, no solo el número.
2. **De dónde sale**: cascada que parte de la base (persona promedio) y va sumando/restando cada factor, con la opción de ver el detalle completo de cada uno (todos los tramos, cuántos puntos vale cada uno, la tasa de atraso real de ese tramo).
3. **Cómo mejorar**: sugerencias concretas calculadas con los datos reales del cliente ("pide X en vez de Y: +7 puntos"), un plan mínimo para ser apto, y un simulador que recalcula en vivo con la misma lógica del servidor (no una aproximación aparte).
4. **Compárate**: distribución de scores y vecinos pseudonimizados, sin exponer a nadie.
5. **Lo que no usamos**: qué variables se excluyeron y por qué, y el costo medido de esa decisión (sección 6.2) — transparencia sobre las limitaciones del propio modelo, no solo sobre sus aciertos.
6. **Tus datos**: los campos cifrados del cliente, descifrado bajo demanda, e historial de quién accedió a ellos.

---

## 6. Implementación

### 6.1 Pipeline de datos

Tres pasos, cada uno ejecutable de forma independiente:

1. **Carga** (`load_raw.py`): los csv limpios (ya procesados en `notebooks/limpieza_datos.ipynb`) se cargan tal cual al schema `raw`.
2. **Transformación** (`transform_core.py`): copia a `core` cifrando las columnas sensibles (ingreso, fecha de nacimiento, deuda externa) con AES-256.
3. **Scoring** (`score_model.py`): entrena el scorecard transparente (ver 6.2) y guarda el resultado por cliente, con el detalle cifrado.

### 6.2 El scorecard transparente

En vez de un modelo de caja negra, se construyó un **scorecard**: cada factor se divide en tramos legibles, cada tramo vale una cantidad fija de puntos, y el score final es simplemente la suma — `score = base (595) + Σ puntos por factor`. Esto permite explicarle a cualquier cliente exactamente de dónde sale cada punto, algo imposible con un modelo de ensamble o una red neuronal.

**Variables excluidas explícitamente, y por qué:**

| Variable | Motivo |
|---|---|
| Género | Atributo protegido — usarlo sería discriminación directa |
| Estado civil / hijos | Vida privada, sin relación causal con la voluntad de pago |
| Nivel educativo | Proxy de nivel socioeconómico — reproduce desigualdad de origen |
| Zona de residencia | Penalizar por barrio es *redlining* (discriminación geográfica) |
| Círculo social (contactos con atrasos) | Juzgaría al cliente por las deudas de sus contactos, no las propias |
| `EXT_SOURCE_1` (score externo 1) | Correlación de 0.60 con la edad — sería usar la edad por la puerta trasera |
| Antigüedad del documento / del registro | Proxies de edad, y no son accionables por el cliente |
| Consultas al bureau | Se evaluó, pero aportaba menos de un punto de señal: se quitó para mantener el score simple |
| Plazo implícito del crédito | Relación no monótona con el riesgo — no se puede explicar de forma honesta |

**Neutralidad ante ausencia de historial** (la decisión ética central del proyecto): cinco factores dependen de tener historial en el bureau externo (score de fuentes externas, antigüedad de ese historial, uso de créditos activos, créditos activos, atraso vigente). Si el cliente no tiene ese historial —el caso típico del "informal" que el negocio busca incluir— esos factores valen **exactamente cero puntos**: no suman ni restan, el cliente se evalúa con lo demás. Esta garantía está verificada por una prueba automatizada contra el modelo real entrenado (`pipeline/tests/test_score_model.py::test_neutralidad_ante_ausencia_de_historial`).

**Costo medido de estas decisiones**: se entrenó en paralelo un modelo "tradicional" (con las variables excluidas, y penalizando la falta de historial) solo para poder comparar. Resultado, sobre 307,507 clientes:

- AUC del scorecard justo: **0.725**. AUC del modelo tradicional: **0.739**. Diferencia: 0.014 de poder predictivo.
- A igual tasa de aprobación global, el scorecard aprueba al **67.3%** de los clientes sin historial en bureau, contra **65.0%** del modelo tradicional.

Es decir: se sacrifica una fracción pequeña y medida de poder predictivo a cambio de una mejora real y medida en inclusión financiera para la población sin historial — que es exactamente el objetivo de negocio del proyecto, no un efecto secundario.

### 6.3 La aplicación web

Backend en FastAPI (Python), frontend en React + D3 (visualizaciones) + Motion (animación), sirviendo solo por HTTPS. El backend expone tres grupos de endpoints (`/api/auth`, `/api/mi/*` para el cliente, `/api/interno/*` para analista/admin), cada uno protegido por el control de rol correspondiente.

El **dashboard analista** (aprobar/rechazar solicitudes) sigue el mismo principio de mínimo privilegio que el resto del sistema: el analista ve una lista de solicitudes con su score, banda y un alias pseudonimizado — nunca el identificador real del cliente ni ningún dato descifrado — y decide en base a eso. La decisión (y quién la tomó, y cuándo) queda en una tabla separada del dato del cliente, y cada decisión se audita igual que cualquier otro acceso.

### 6.4 Pruebas

Se implementó una suite de 24 pruebas automatizadas (`pytest`) contra el sistema real, no simuladas:

- **Sobre el modelo entrenado real** (4 pruebas): el score está siempre en el rango 300–850, la neutralidad ante ausencia de historial se cumple para los 5 factores marcados como tales, el score de una muestra de clientes reales (descifrando su detalle) coincide exactamente con `base + suma de puntos`, y las bandas de riesgo cubren todo el rango sin huecos.
- **Sobre la lógica de seguridad** (13 pruebas): el control de roles rechaza correctamente accesos no autorizados, el límite de intentos por IP bloquea tras el máximo configurado, el hash de contraseñas funciona correctamente incluyendo el caso de usuario inexistente (sin filtrar información por timing).
- **Sobre la garantía anti-IDOR** (7 pruebas): verificación arquitectónica de que ningún endpoint del cliente acepta un identificador en la URL, que el único parámetro de ruta del panel interno es el UUID de una solicitud (nunca el identificador del cliente), y que el alias pseudonimizado es estable pero no reversible.

---

## 7. Plan de respuesta a incidentes

Plan básico ante una fuga o pérdida de datos, apoyado en los mecanismos ya implementados (auditoría y backup):

1. **Detección**: la primera señal es un patrón anómalo en `app.logs_auditoria` — un pico de intentos de login fallidos, de bloqueos por IP, o de acciones de descifrado (`DESCIFRAR`) fuera de lo habitual. El panel del administrador muestra estos indicadores en tiempo real (sección "Seguridad · últimas 24 h" del panel interno).
2. **Contención**: aislar el sistema afectado deteniendo el proceso de la aplicación (`run.py`), y si el compromiso parece venir de credenciales de base de datos filtradas, revocar y rotar el rol `etike_app` de inmediato (el rol tiene privilegios mínimos por diseño, lo que limita el daño posible incluso si se compromete).
3. **Notificación**: comunicar a los usuarios afectados y, según corresponda por la Ley N.º 29733, a la autoridad de protección de datos, dentro del plazo que exige la normativa vigente. La comunicación debe indicar qué datos se vieron comprometidos (el registro de auditoría permite reconstruir exactamente qué se accedió y sobre qué clientes).
4. **Recuperación**: restaurar el sistema desde el backup más reciente (`pipeline/backup_db.py --restore`), verificado y probado en este proyecto (sección 4.4).
5. **Post-mortem**: documentar la causa raíz, qué detectó (o no detectó) el incidente a tiempo, y qué control adicional se necesita para que no se repita — alimentando directamente la lista de recomendaciones futuras (sección 8).

---

## 8. Recomendaciones futuras

Medidas que se identificaron como valiosas pero que **no se implementaron en esta entrega**, con la justificación de por qué:

- **Autenticación multifactor (MFA) para analistas y administradores**: reduciría el riesgo de una cuenta interna comprometida por credenciales filtradas. No se implementó por el alcance de tiempo del proyecto; es la mejora de seguridad de mayor prioridad para una siguiente iteración, dado que esas cuentas tienen acceso a datos agregados de todos los clientes.
- **Cifrado homomórfico para el scoring**: permitiría calcular el score sin que el servidor tenga que descifrar los datos del cliente en ningún momento del proceso. Se descartó por su alto costo computacional y de complejidad de implementación frente al beneficio marginal, dado que el resto del sistema ya minimiza cuándo y qué se descifra.
- **Auditoría externa de seguridad anual**: una revisión independiente (pentesting, revisión de código) da una validación que el propio equipo no puede darse. No se hizo por ser un proyecto académico sin presupuesto para ello, pero se recomienda antes de cualquier despliegue real.
- **Tokenización de identificadores más allá del alias HMAC actual**: usar un servicio de tokenización dedicado (en vez de HMAC con llave propia) separaría por completo la capacidad de re-identificar a un cliente del resto del sistema, incluso de un administrador con acceso a la base.
- **Web Application Firewall (WAF)**: una capa adicional contra ataques comunes (inyección, fuerza bruta a nivel de red) delante de la aplicación. No se implementó porque el entorno de despliegue actual es de desarrollo/demo, sin exposición a internet pública.
- **Límite de intentos distribuido**: el límite de intentos por IP actual vive en memoria del proceso de la aplicación — funciona bien para una sola instancia, pero no se coordina entre varias si el sistema se escalara horizontalmente. La solución (un almacén compartido tipo Redis) es directa, pero no se justificaba para el alcance de una sola instancia de este proyecto.

---

## 9. Lecciones aprendidas y retrospectiva

- ¿Qué parte del proyecto tomó más tiempo de lo esperado, y por qué?
- ¿Qué decisión técnica o de diseño cambiarían si empezaran de nuevo?
- ¿Qué fue lo más difícil de balancear entre "justo/inclusivo" y "preciso" en el modelo?
- ¿Cómo se dividió el trabajo en el equipo, y qué harían distinto en la coordinación?
- ¿Qué aprendieron sobre seguridad de datos que no sabían antes de empezar?
- Si tuvieran una semana más, ¿en qué la invertirían?

---

*Informe del proyecto CrediFácil — DS3031, Ética y Seguridad de Datos. Código fuente completo, pipeline y detalles técnicos adicionales en el [repositorio de GitHub](https://github.com/Jyns123/ETIKE).*
