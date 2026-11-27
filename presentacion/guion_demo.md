# Guion de la demo en vivo — CrediFácil (DS3031)

Para ensayar la sustentación entre Jyns y Joaquin. Recorrido de unos 10 minutos: cada paso dice qué abrir, qué mostrar y qué requerimiento cumple. Al final hay un plan B y las preguntas probables con su respuesta corta.

## 1. Antes de la sustentación (una vez, en la PC de la demo)

```bash
# 1. base de datos (cluster propio, puerto 5433; no es el servicio de Windows)
"C:/Program Files/PostgreSQL/16/bin/pg_ctl.exe" start -D "C:/Users/jynsordonez/AppData/Local/ETIKE/pgdata" -l "C:/Users/jynsordonez/AppData/Local/ETIKE/postgres.log"

# 2. una contraseña demo que ambos conozcan (mín. 12 caracteres; resetea las 12 cuentas demo)
cd web/backend
DEMO_PASSWORD='elegir-una-frase-larga' python scripts/seed_users.py

# 3. confiar en la CA del proyecto, para que el navegador muestre el candado (sin admin)
certutil -user -addstore Root ../certs/ca.crt

# 4. chequeo previo: 39 pruebas de la web (las 12 del pipeline necesitan pipeline/.env cargado)
python -m pytest -q

# 5. arrancar (solo HTTPS) y abrir https://localhost:8443
python run.py
```

Dejar abiertos, cada uno en su pestaña o ventana:

- La app: `https://localhost:8443`.
- El informe publicado: <https://jyns123.github.io/ETIKE/>, en la sección 6.8 y en la 14.
- `notebooks/privacidad_diferencial.ipynb`, ya ejecutado (no hace falta volver a correrlo en vivo).
- Una terminal de Git Bash en la raíz del repo, para el paso de TLS.

**Ojo con el bloqueo:** 5 contraseñas erradas bloquean la cuenta 15 minutos, y 10 intentos en 5 minutos bloquean la IP. En vivo, como mucho **un** intento fallido.

## 2. Recorrido (~10 min)

| # | Quién | Qué hacer | Qué decir | Requerimiento |
|---|---|---|---|---|
| 1 | Jyns | Login como `demo.informal` con una contraseña errada, y después con la correcta | Mismo mensaje para usuario inexistente o contraseña errada; la contraseña se guarda con Argon2id; la cookie de sesión no la puede leer JavaScript | Hashing, gestión de accesos |
| 2 | Jyns | **01 Tu score**: medidor y percentil | Decisión en 35 ms frente a días en la banca tradicional (OKR O4) | Valor medido (KPIs) |
| 3 | Jyns | **02 De dónde sale cada punto**: reproducir la cascada y abrir un factor de bureau | Este cliente no tiene historial y esos factores valen 0: no tener historial no castiga | Ética: neutralidad |
| 4 | Jyns | **03 Cómo mejorar**: plan para ser apto y el simulador "¿Qué pasaría si…?" | El simulador recalcula con la misma lógica del servidor | Funcionalidad |
| 5 | Jyns | **04 Compárate**: vecinos con alias, score redondeado, ingreso cifrado; "Intentar descifrar" | Nadie, ni el personal, puede descifrar el dato de otra persona | Pseudonimización |
| 6 | Jyns | **05 Lo que no usamos** | Excluir edad, género, zona, etc. cuesta 0,014 de AUC y aprueba 67,3% sin historial frente a 64,3% | Ética: transparencia |
| 7 | Jyns | **06 Tus datos**: bytes cifrados, "Descifrar con mi sesión" (ingreso) e "Intentar descifrar" la fecha de nacimiento | El 4.º byte `09` es AES-256. La fecha de nacimiento nunca se descifra: el intento se niega y queda en el registro de accesos, que se ve abajo | Cifrado en reposo, auditoría, minimización |
| 8 | Joaquin | Salir y entrar como `analista`: indicadores, seguridad de las últimas 24 h y **Aprobar** una solicitud | Decide viendo alias y score, nunca el ingreso ni el ID real: el rol de la base ni siquiera tiene esa columna | RBAC, mínimo privilegio |
| 9 | Joaquin | Salir y entrar como `admin`: **Registro de auditoría** | Ahí está todo lo que acabamos de hacer: el login fallido, el descifrado, el intento negado y la decisión. La app solo puede insertar en esa tabla, no borrar | Logs inalterables |
| 10 | Joaquin | Candado del navegador → certificado; y en la terminal los dos comandos de abajo | Emitido por nuestra CA propia; TLS 1.3 se acepta y TLS 1.1 se rechaza | Certificados, cifrado en tránsito |
| 11 | Joaquin | Notebook: gráfico del barrido de ε y la tabla de la fase 3b | Con ε = 1 el error del grupo más chico baja de 0,4%; el error del grupo grande es sesgo de recorte, no ruido | Privacidad diferencial |
| 12 | Jyns | Informe, sección 14: tabla de equidad y decisión | La DPIA midió que el score aprueba al 54% de 20-29 años frente al 88% de 60+, aunque no usa la edad; lo explicamos y queda como riesgo residual con monitoreo | DPIA, ética |

Comandos del paso 10 (Git Bash, desde la raíz del repo):

```bash
echo | openssl s_client -connect localhost:8443 -tls1_3 -CAfile web/certs/ca.crt 2>/dev/null | grep -E "Protocol|Verify return"
echo | openssl s_client -connect localhost:8443 -tls1_1 -cipher 'DEFAULT:@SECLEVEL=0' 2>&1 | grep -E "Cipher is|alert"
```

Esperado: `Protocol: TLSv1.3` y `Verify return code: 0 (ok)` en el primero; `Cipher is (NONE)` en el segundo.

## 3. Plan B

- **Si la app local falla**: la demo estática <https://jyns123.github.io/ETIKE/demo/> (contraseña `demo` para todas las cuentas) muestra el mismo panel con respuestas reales exportadas del backend. Avisar que ahí no corre la seguridad real (TLS propio, Argon2id, pgcrypto); para eso, mostrar la sección 7.2 del informe.
- **Si una cuenta queda bloqueada**: entrar con otra cuenta demo (`demo.limite`, `demo.sinhistorial`), o volver a correr `seed_users.py`, que limpia los bloqueos.
- **Si no hay internet**: el informe se puede abrir desde `docs/index.md` en VS Code (vista previa de Markdown).

## 4. Preguntas probables

| Pregunta | Respuesta corta | Dónde |
|---|---|---|
| ¿Qué protege la privacidad diferencial que no proteja el cifrado? | El cifrado protege un registro; la DP protege a una persona frente a alguien que combina agregados publicados | 6.8 |
| ¿Por qué ε = 1? | Barrido medido (0,1, 1 y 10): con 1 el error del grupo más chico ya baja de 0,4%; más débil que el Censo 2020 no hace falta, y Apple usa 2 a 8 por envío en telemetría continua | 6.8 |
| ¿Y si alguien consulta muchas veces? | Los valores ruidosos se calculan una vez por publicación; si no, promediar anularía el ruido | 6.8 |
| ¿Por qué el modelo aprueba menos a los jóvenes si no usa la edad? | Estabilidad e historial acumulan años (31 y 34 puntos de diferencia). Su atraso real también es mayor, y entre aprobados se atrasan más, así que el modelo no es más duro que su riesgo. Igual lo dejamos como riesgo residual medio, con monitoreo | 14.5 |
| ¿Por qué excluyeron la antigüedad del documento y no los años de empleo? | Criterio: correlacionado con la edad **y** sin relación legítima con el pago. El documento solo dice cuándo se hizo un trámite; el empleo mide estabilidad | 14.4 |
| ¿La decisión es automatizada? (art. 87) | El score sí; aprobar o rechazar lo decide un analista, y el cliente ve cada punto | 2.1, 14.4 |
| ¿Por qué hicieron una DPIA si es facultativa? | El art. 40 la recomienda para datos sensibles, perfiles y grandes volúmenes (tenemos los tres), y el art. 125.4 la cuenta como atenuante | 14.1 |
| ¿Qué pasa si roban el servidor? | Los backups van cifrados con AES-256-GCM, pero el schema `raw` está en claro: es riesgo residual medio y una condición antes de usar datos reales | 10, 14.6 |
| ¿Por qué una CA propia y no Let's Encrypt? | Lo pide el curso; en producción sería una CA pública y la llave de la CA fuera de línea | 10 |
| ¿Qué falta para producción? | Las cuatro condiciones de la DPIA: consentimiento y aviso del art. 6.1, Oficial de Datos Personales, MFA + backup externo + KMS + retirar `raw`, y monitoreo de equidad | 14.7 |
