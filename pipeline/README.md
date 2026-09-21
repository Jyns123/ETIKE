# Pipeline: cómo ejecutarlo y cómo probarlo

Carga los csv limpios (dataset/) a Postgres: primero a un schema raw (copia fiel del csv), después a un schema core (cifrado con pgcrypto, con los flags de la limpieza), y por último entrena el scorecard transparente que usa la web (`score_model.py`: `core.modelo_scorecard` + `core.scores`). Ver los comentarios dentro de cada .py para el detalle de qué hace cada paso.

## 1. Requisitos

- Postgres instalado y corriendo (versión 13+)
- Python 3.10+
- Los csv application_train_clean.csv y bureau_clean.csv, descargados del Drive del equipo y colocados en la carpeta dataset/ en la raíz del proyecto (junto a pipeline/ y notebooks/)

## 2. Instalación

```bash
cd pipeline
pip install -r requirements.txt
```

En Windows, si `pip` no funciona directo, usar `python -m pip install -r requirements.txt`.

## 3. Configurar credenciales

```bash
cp .env.example .env
```

En Windows con PowerShell/CMD (sin Git Bash), `cp` no existe: usar `copy .env.example .env` en CMD, o `Copy-Item .env.example .env` en PowerShell.

Editar `.env` con:
- Usuario/password de tu Postgres local
- Una llave para `HC_ENCRYPTION_KEY` (cualquier texto largo, es la llave con la que pgcrypto cifra las columnas sensibles)

## 4. Crear la base de datos y cargar las variables de entorno

macOS / Linux (bash o zsh):

```bash
export $(cat .env | xargs)
createdb homecredit
```

Windows (PowerShell):

```powershell
Get-Content .env | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.*)$') {
        [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
    }
}
createdb homecredit
```

Windows (si tiene Git Bash instalado, que suele venir con Git for Windows): usar los mismos comandos de macOS/Linux, Git Bash los entiende igual.

Si `createdb` no se reconoce como comando en Windows, hay que agregar la carpeta bin de la instalación de Postgres al PATH (típicamente `C:\Program Files\PostgreSQL\16\bin`), o usar pgAdmin (interfaz gráfica que viene con el instalador de Windows) para crear la base de datos `homecredit` a mano en vez de por consola.

## 5. Correr el pipeline

```bash
python run_pipeline.py
```

En Windows puede ser `python` directo (a diferencia de macOS/Linux donde a veces hace falta `python3`).

Si todo corrió bien, imprime:

```
raw.application_train_clean cargada
raw.bureau_clean cargada
core.solicitudes y core.historial_bureau poblados
scorecard entrenado: AUC=0.725 (tradicional 0.739), umbral apto=580, aprobacion sin historial 67.3% vs 64.3%
core.modelo_scorecard y core.scores poblados (307,507 clientes)
```

El paso 3 (scorecard) se puede re-correr solo, sin recargar todo: `python score_model.py` (~3 min).

## 6. Probar que quedó bien

Conectarse con psql:

```bash
psql -d homecredit
```

En Windows, si `psql` no se reconoce, usar la ruta completa (típicamente `"C:\Program Files\PostgreSQL\16\bin\psql.exe" -d homecredit`) o agregar esa carpeta al PATH.

Queries de ejemplo:

```sql
-- ver estructura de la tabla
\d core.solicitudes

-- ver 5 filas (el ingreso sale cifrado, ilegible)
SELECT * FROM core.solicitudes LIMIT 5;

-- descifrar el ingreso de un cliente puntual (usar la misma llave del .env)
SELECT sk_id_curr, pgp_sym_decrypt(ingreso_cifrado, 'tu-llave-de-HC_ENCRYPTION_KEY') AS ingreso
FROM core.solicitudes WHERE sk_id_curr = 100002;

-- contar cuántos clientes SÍ tienen historial bureau vs no (KPI de inclusión financiera)
SELECT tiene_historial_bureau, count(*) FROM core.solicitudes GROUP BY tiene_historial_bureau;

-- score del scorecard: distribucion por banda y aprobados con/sin historial
SELECT banda, tiene_historial, count(*), round(avg(score)) FROM core.scores GROUP BY 1, 2 ORDER BY 1, 2;

-- definicion del modelo (tramos, puntos, metricas): es publica, la web se la muestra al cliente
SELECT definicion -> 'metricas', definicion -> 'comparacion' FROM core.modelo_scorecard WHERE activo;

-- el detalle por cliente esta cifrado (AES-256); solo se descifra con la llave
SELECT pgp_sym_decrypt(detalle_cifrado, 'tu-llave-de-HC_ENCRYPTION_KEY') FROM core.scores WHERE sk_id_curr = 100002;

-- salir
\q
```

Alternativa visual en cualquier sistema operativo: pgAdmin4 (viene con la instalación de Postgres). Conectar con host localhost, el puerto configurado, la base homecredit, y el usuario/password del .env.

## Notas generales Windows vs macOS/Linux

- El código Python del pipeline (los .py) funciona igual en los tres sistemas, no hace falta cambiar nada ahí: usa pathlib, que maneja las rutas de forma independiente del sistema operativo.
- Lo que cambia es solo la terminal/consola: sintaxis de variables de entorno, cp vs copy, y si los comandos de Postgres (psql, createdb) están en el PATH.
- La forma más simple de evitar todas estas diferencias en Windows es usar Git Bash (si ya tiene Git instalado para clonar el repo, probablemente ya lo tiene) y seguir los comandos de macOS/Linux tal cual.

---

## Guía completa paso a paso (Windows)

Guía autocontenida para levantar el pipeline en Windows desde cero, incluyendo cómo ver el resultado en DataGrip.

### 1. Instalar Postgres

Bajar el instalador oficial de https://www.postgresql.org/download/windows/ (el de EDB, es el primero que aparece). Correrlo como cualquier programa.

Durante la instalación va a pedir una **contraseña para el usuario `postgres`** (el superusuario/admin). Anotar esa contraseña, se necesita más adelante. Dejar el puerto en su valor por defecto (`5432`).

Al terminar, Postgres queda corriendo solo en segundo plano como servicio de Windows, no hay que abrirlo manualmente cada vez.

### 2. Crear la base de datos del proyecto

Abrir Git Bash (recomendado, viene con Git for Windows) o CMD/PowerShell, y correr:

```bash
createdb -U postgres homecredit
```

Va a pedir la contraseña del paso 1.

Si `createdb` no se reconoce como comando: agregar la carpeta bin de Postgres al PATH (típicamente `C:\Program Files\PostgreSQL\16\bin`), o usar **pgAdmin** (viene instalado junto con Postgres, tiene interfaz gráfica): click derecho en "Databases" → Create → Database → nombre `homecredit`.

### 3. Clonar el repo y entrar a la carpeta pipeline

```bash
git clone https://github.com/Jyns123/ETIKE.git
cd ETIKE/pipeline
```

### 4. Instalar dependencias de Python

```bash
python -m pip install -r requirements.txt
```

### 5. Configurar el archivo .env

En Git Bash:

```bash
cp .env.example .env
```

En CMD:

```cmd
copy .env.example .env
```

En PowerShell:

```powershell
Copy-Item .env.example .env
```

Abrir `.env` con cualquier editor de texto y completar:

```
PGHOST=localhost
PGPORT=5432
PGDATABASE=homecredit
PGUSER=postgres
PGPASSWORD=la-contraseña-del-paso-1
HC_ENCRYPTION_KEY=cualquier-texto-largo-que-inventes
```

### 6. Poner los csv en su lugar

Descargar application_train_clean.csv y bureau_clean.csv del Drive del equipo, y colocarlos en la carpeta dataset/ del repo (ETIKE/dataset/), con esos nombres exactos.

### 7. Correr el pipeline

Desde la carpeta pipeline/:

En Git Bash:

```bash
export $(cat .env | xargs)
python run_pipeline.py
```

En PowerShell:

```powershell
Get-Content .env | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.*)$') {
        [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
    }
}
python run_pipeline.py
```

Si todo corrió bien, se imprime:

```
raw.application_train_clean cargada
raw.bureau_clean cargada
core.solicitudes y core.historial_bureau poblados
scorecard entrenado: AUC=0.725 (tradicional 0.739), umbral apto=580, aprobacion sin historial 67.3% vs 64.3%
core.modelo_scorecard y core.scores poblados (307,507 clientes)
```

El paso 3 (scorecard) se puede re-correr solo, sin recargar todo: `python score_model.py` (~3 min).

### 8. Ver el resultado en DataGrip

1. Abrir DataGrip → `+` → `Data Source` → `PostgreSQL`
2. Completar con los mismos datos del `.env`:
   - Host: `localhost`
   - Port: `5432`
   - Database: `homecredit`
   - User: `postgres`
   - Password: la del paso 1
3. `Test Connection` (si pide descargar el driver de Postgres, aceptar)
4. `OK`

### 9. Hacer visibles los schemas raw y core

Por defecto DataGrip solo muestra el schema `public` (se ve como "1 of 5" al lado del nombre de la base). Los schemas `raw` y `core` existen pero están ocultos:

1. Click derecho sobre `homecredit@localhost` (o sobre el ícono de filtro que aparece junto al "1 of 5")
2. Elegir **"Schemas..."**
3. Marcar también `raw` y `core` (además de `public`)
4. Aceptar

Ahora sí aparecen `raw` y `core` en el árbol, con las tablas adentro (`raw.application_train_clean`, `raw.bureau_clean`, `core.solicitudes`, `core.historial_bureau`, `core.modelo_scorecard`, `core.scores`). Si ya se configuró la web, también aparece el schema `app` (usuarios, sesiones, auditoría).

### 10. Queries de ejemplo (correr en el editor SQL de DataGrip)

```sql
-- ver 5 filas (el ingreso sale cifrado, ilegible)
SELECT * FROM core.solicitudes LIMIT 5;

-- descifrar el ingreso de un cliente puntual (usar la misma llave del .env)
SELECT sk_id_curr, pgp_sym_decrypt(ingreso_cifrado, 'tu-llave-de-HC_ENCRYPTION_KEY') AS ingreso
FROM core.solicitudes WHERE sk_id_curr = 100002;

-- contar cuántos clientes SÍ tienen historial bureau vs no (KPI de inclusión financiera)
SELECT tiene_historial_bureau, count(*) FROM core.solicitudes GROUP BY tiene_historial_bureau;
```

---

## Paso 3: scorecard transparente (`score_model.py`)

Entrena el "Score CrediFácil" que explica la web (`web/`). Es un scorecard: cada factor se parte en tramos, cada tramo vale puntos fijos y el score es la suma (base 595 ≈ persona promedio, escala 300–850, cada 50 puntos se duplica la razón buenos/malos). Así se le puede decir al cliente de dónde sale cada punto y qué cambiar para subir.

Decisiones éticas (detalle en los comentarios del .py):

- No usa género, edad, estado civil/hijos, educación, zona, círculo social, ni proxies fuertes de edad (`EXT_SOURCE_1` tiene correlación 0.60 con la edad; antigüedad de documento y de registro).
- **Neutralidad ante ausencia de historial**: si el cliente no tiene historial en bureau, esos factores valen 0 puntos (no suman ni restan).
- Entrena además un modelo "tradicional" (con esas variables y penalizando la falta de historial) solo para medir el costo/beneficio: el scorecard pierde 0.015 de AUC (0.725 vs 0.739) y a igual tasa de aprobación global aprueba 67.3% de los clientes sin historial vs 64.3% del tradicional.

Tablas que crea:

| Tabla | Contenido |
|---|---|
| `core.modelo_scorecard` | Definición del modelo en JSONB (tramos, puntos, métricas, variables excluidas y por qué). No es secreta. |
| `core.scores` | 1 fila por cliente: score, banda, apto, puntos por pilar. El detalle (valores de cada factor, ingreso, montos) va en `detalle_cifrado`, cifrado con `pgp_sym_encrypt(..., 'cipher-algo=aes256')`. |

> Nota sobre el algoritmo: `pgp_sym_encrypt` sin opciones usa **AES-128** (se ve en el 4º byte del cifrado: `c30d0407…` = AES-128, `c30d0409…` = AES-256). `transform_core.py` hoy cifra ingreso, nacimiento y deuda con el default; para cumplir el AES-256 de la guía basta con agregar el tercer argumento `'cipher-algo=aes256'`.
