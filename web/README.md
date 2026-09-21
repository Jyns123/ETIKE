# web/: panel del cliente "Tu score, sin cajas negras"

Front (React + D3) y back (FastAPI) donde cada cliente entra con su cuenta y ve **cómo se calculó su score**, **qué cambiar para ser apto** (aunque no tenga historial) y **cómo se compara con otros** sin exponer a nadie: los demás aparecen con alias y su ingreso se muestra tal como está guardado, cifrado.

```
navegador ──HTTPS (TLS 1.2+, CA propia)──> FastAPI (web/backend) ──> Postgres
   React + D3 + Motion                      rol etike_app            raw   (sin acceso)
   cookie de sesión HttpOnly                 (mínimo privilegio)     core  (solo lectura: scores, modelo, columnas cifradas)
                                                                      app   (usuarios, sesiones, auditoría)
```

## Requisitos

- El pipeline corrido completo, **incluido el paso 3** (`pipeline/score_model.py`), ver `pipeline/README.md`.
- Python 3.10+ y Node 20+.

## Levantarlo (una sola vez)

Desde la raíz del repo:

```bash
pip install -r web/backend/requirements.txt

# 1. certificados: CA propia + certificado de localhost (quedan en web/certs/, no van a git)
python web/backend/scripts/gen_certs.py

# 2. schema app + rol etike_app con permisos mínimos. Lee pipeline/.env y genera web/backend/.env
python web/backend/scripts/init_app_db.py

# 3. cuentas demo (muestra la contraseña UNA vez; en la BD solo queda el hash Argon2id)
python web/backend/scripts/seed_users.py
#    o con una contraseña propia (mín. 12 caracteres):
#    DEMO_PASSWORD='algo-largo-y-propio' python web/backend/scripts/seed_users.py

# 4. compilar el front
cd web/frontend && npm install && npm run build && cd ../..

# 5. arrancar (solo HTTPS)
cd web/backend && python run.py
```

Abrir **https://localhost:8443**.

Para que el navegador no muestre la advertencia de certificado, confiar en la CA del proyecto:

- Windows (usuario actual, sin admin): `certutil -user -addstore Root web\certs\ca.crt`
- macOS: `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain web/certs/ca.crt`
- O aceptar la advertencia una vez (es nuestra propia CA, no una pública).

> Si el pipeline se vuelve a correr desde cero (se recrean las tablas de `core`), repetir el paso 2 para reaplicar los permisos del rol.

### Modo desarrollo

Con el backend corriendo (`python run.py`), en otra terminal: `cd web/frontend && npm run dev` y abrir https://localhost:5173 (Vite recarga al guardar y reenvía `/api` al backend).

## Cuentas demo

Todas usan la contraseña que imprime `seed_users.py`.

| Usuario | Caso que muestra |
|---|---|
| `demo.limite` | 6 puntos bajo el umbral: el plan para ser apto es de un solo paso |
| `demo.informal` | Sin historial en bureau, cerca del umbral: los factores de bureau valen 0 (neutralidad) |
| `demo.sinhistorial` | Sin historial y apto |
| `demo.atraso` | Con un atraso vigente en otra entidad |
| `demo.deudas` | 4+ créditos activos y deuda al límite |
| `demo.apto`, `demo.bueno`, `demo.excelente` | Distintas bandas por encima del umbral |
| `demo.pension` | Pensionado, sin empleo actual |
| `demo.riesgo` | Riesgo alto |
| `analista` | Panel interno: indicadores agregados |
| `admin` | Panel interno + registro de auditoría |

## Qué muestra la página

1. **Tu score**: medidor, percentil y "de cada 100 personas con tu score, X se atrasaron".
2. **De dónde sale**: cascada que parte de la base (persona promedio) y suma/resta cada factor; se puede reproducir paso a paso, ver como tabla, y abrir cada factor para ver todos sus tramos, cuántos puntos vale cada uno y la tasa de atraso real de ese tramo.
3. **Cómo mejorar**: sugerencias calculadas con tus datos ("pide X en vez de Y: +7"), plan mínimo para ser apto y simulador "¿qué pasaría si…?" que recalcula en vivo con la misma lógica del servidor.
4. **Compárate**: distribución de scores, vecinos de score pseudonimizados (alias HMAC, score redondeado) y su ingreso tal como está en la BD (cifrado).
5. **Lo que no usamos**: variables excluidas y por qué, política de neutralidad y el costo medido (AUC y aprobación vs. un modelo tradicional).
6. **Tus datos**: tus campos cifrados byte a byte, descifrado bajo demanda (queda auditado) e historial de quién accedió a tus datos.

## Medidas de seguridad y dónde están

| Medida | Implementación |
|---|---|
| Contraseñas | Argon2id con sal por cuenta, rehash automático si cambian los parámetros (`app/security.py`) |
| Enumeración de usuarios | Mensaje de error único y verificación contra un hash de relleno si el usuario no existe (`routers/auth.py`) |
| Fuerza bruta | Bloqueo de cuenta 15 min tras 5 fallos + límite de 10 intentos / 5 min por IP (`app/security.py`) |
| Sesiones | Token aleatorio de 256 bits en cookie `__Host-` HttpOnly, Secure, SameSite=Strict; en BD solo su SHA-256; expira a los 30 min sin actividad y a las 8 h; login invalida sesiones previas (`app/security.py`) |
| CSRF | SameSite=Strict + verificación de la cabecera `Origin` en toda petición que cambia estado (`app/main.py`) |
| Cabeceras | CSP estricta (sin `unsafe-inline`, sin CDNs, fuentes locales), HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (`app/main.py`) |
| Tránsito | Solo HTTPS con certificado firmado por CA propia, ECDSA P-256, suites ECDHE+AES-GCM/ChaCha20 (`scripts/gen_certs.py`, `run.py`) |
| Reposo | Datos sensibles cifrados con pgcrypto; el detalle del score con AES-256. La app descifra solo lo del titular y nunca la edad (no la usa) (`routers/cliente.py`) |
| IDOR | Ningún endpoint recibe un ID de cliente: todo sale de la sesión (`routers/cliente.py`) |
| Pseudonimización | Otros clientes se ven como `CF-XXXX-XXXX` (HMAC-SHA256 con llave del servidor), score redondeado a decenas (`routers/cliente.py`) |
| Mínimo privilegio | Rol `etike_app`: sin acceso a `raw`, SELECT por columna en `core.solicitudes`, auditoría solo INSERT (`sql/app_schema.sql`) |
| Auditoría | Cada login, lectura y descifrado queda en `app.logs_auditoria` (quién, cuándo, qué, IP, resultado); el cliente ve los suyos y el admin todos |
| RBAC | `cliente` (su score), `analista` (agregados), `admin` (agregados + auditoría) (`requiere_rol` en `app/security.py`) |
| Llave en logs | La llave de pgcrypto viaja en el texto SQL: el rol tiene `log_min_error_statement = panic` para que Postgres no la escriba en su log |

## Notas

- Los montos están en las unidades monetarias (u.m.) del dataset original de Home Credit; no son soles.
- En Windows, `curl` (Schannel) falla contra la CA local por no tener lista de revocación: usar `curl --ssl-no-revoke --cacert web/certs/ca.crt ...`.
- `DEV_DOCS=1 python run.py` habilita la documentación interactiva de la API en `/api/docs` (apagada por defecto).
