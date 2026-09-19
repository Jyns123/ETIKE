# Guía Proyecto — Home Credit + Seguridad de Datos (DS3031)

## 1. Caso de negocio

**Empresa ficticia**: fintech tipo "CrediFácil" — otorga microcréditos a personas sin historial bancario tradicional (informales), usando modelo de scoring alternativo.

**Problema que resuelve**: bancos tradicionales rechazan informales por falta de historial. CrediFácil usa data alternativa (empleo, ingresos declarados, historial en bureau) para evaluar riesgo y dar acceso a crédito.

**KPIs/OKRs** (la rúbrica pide medir valor objetivamente):
- Tasa de aprobación (% solicitudes aceptadas)
- Tasa de default proyectada (del modelo, vs `TARGET` real)
- Tiempo promedio de decisión (ej: <5 min vs banco tradicional días)
- % reducción de exclusión financiera (comparar aprobados sin historial bureau vs con historial)

## 2. Dataset

- Base: `application_train.csv` (Home Credit Default Risk, Kaggle)
- Opcional complemento (el PDF pide agregar datasets adicionales): `bureau.csv` (historial crediticio externo) — refuerza caso de "inclusión financiera"
- Dataset adicional sugerido fuera de Kaggle: contexto Perú (ej. INEI empleo informal, o tasas SBS) para justificar el caso de negocio local — no necesita ser grande, solo contexto/narrativa en el informe

## 3. Arquitectura técnica (requerimiento: DB + front + backend)

- **Backend**: API simple (Flask/FastAPI/Node) — endpoint recibe solicitud de crédito, guarda en BD, corre modelo (o mock de modelo) de scoring, devuelve decisión
- **Base de datos**: Postgres/MySQL/SQLite — tabla `solicitudes` (datos del aplicante), tabla `usuarios_sistema` (analistas con roles), tabla `logs_auditoria`
- **Frontend**: mínimo — formulario de solicitud + dashboard analista (ver solicitudes, aprobar/rechazar). No necesita ser detallado, solo funcional (lo aclara el PDF)

## 4. Seguridad — datos en reposo y tránsito

- **Encriptación en reposo**: campos sensibles (ingreso, tipo de empleo, `SK_ID_CURR` como identificador) cifrados en BD (AES-256 a nivel columna, o cifrado de disco completo si se simplifica)
- **Hashing**: contraseñas de analistas con bcrypt/argon2
- **Transporte**: HTTPS/TLS entre front-backend, certificado autofirmado o CA propia (requerimiento explícito del PDF)
- **Gestión de accesos**: roles — analista (ve solicitudes asignadas), admin (ve todo + logs), sistema (solo escribe). RBAC simple en backend
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
1. Detección (cómo se detectaría una fuga — alertas en logs)
2. Contención (aislar el sistema afectado)
3. Notificación (a usuarios afectados + autoridad si aplica, plazo según ley)
4. Recuperación (restaurar desde backup)
5. Post-mortem (lecciones aprendidas)

## 8. Recomendaciones futuras (lo que no se implementará ahora)

Ejemplos a listar y justificar: MFA para analistas, cifrado homomórfico para scoring sin exponer data cruda, auditoría externa anual, tokenización de identificadores, WAF.

## 9. Informe escrito — estructura sugerida

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
2. Explorar `application_train.csv`, definir features sensibles
3. Diseñar esquema de BD + arquitectura
4. Backend + BD funcionando (CRUD solicitudes)
5. Meter capa de seguridad (cifrado, roles, logs, TLS)
6. Front mínimo conectado
7. Escribir informe en paralelo (no dejar para el final)
