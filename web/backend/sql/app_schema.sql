-- Schema "app": cuentas, sesiones y auditoria de la web.
-- Lo ejecuta scripts/init_app_db.py con el superusuario (una sola vez, o de
-- nuevo si el pipeline recrea core.*: es idempotente).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario TEXT UNIQUE NOT NULL CHECK (usuario ~ '^[a-z0-9._-]{3,40}$'),
    password_hash TEXT NOT NULL,              -- Argon2id ($argon2id$v=19$...), nunca la contrasenia
    rol TEXT NOT NULL CHECK (rol IN ('cliente', 'analista', 'admin')),
    sk_id_curr BIGINT UNIQUE REFERENCES core.solicitudes (sk_id_curr),
    intentos_fallidos INT NOT NULL DEFAULT 0,
    bloqueado_hasta TIMESTAMPTZ,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_login TIMESTAMPTZ,
    -- un cliente siempre esta ligado a su solicitud; el personal interno nunca
    CHECK ((rol = 'cliente') = (sk_id_curr IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS app.sesiones (
    token_hash BYTEA PRIMARY KEY,             -- SHA-256 del token; el token en claro solo vive en la cookie
    usuario_id UUID NOT NULL REFERENCES app.usuarios (id) ON DELETE CASCADE,
    creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultima_actividad TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_en TIMESTAMPTZ NOT NULL,
    ip INET,
    user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON app.sesiones (usuario_id);

CREATE TABLE IF NOT EXISTS app.logs_auditoria (
    id BIGSERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario_id UUID REFERENCES app.usuarios (id),
    usuario TEXT,                             -- nombre usado (sirve tambien para intentos fallidos)
    accion TEXT NOT NULL,                     -- LOGIN, VER_SCORE, DESCIFRAR, ...
    recurso TEXT,                             -- tabla/columna tocada
    sk_id_curr_objetivo BIGINT,               -- cliente cuyos datos se accedieron
    exito BOOLEAN NOT NULL,
    ip INET,
    user_agent TEXT,
    detalle JSONB
);
CREATE INDEX IF NOT EXISTS idx_logs_usuario ON app.logs_auditoria (usuario_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_logs_objetivo ON app.logs_auditoria (sk_id_curr_objetivo, ts DESC);

-- Decision del analista/admin sobre una solicitud (aprobar/rechazar). Se
-- referencia por el UUID propio de core.solicitudes (no por sk_id_curr, que
-- nunca sale hacia el front): analista solo ve el alias pseudonimizado y el
-- score, nunca el identificador real ni datos descifrados del cliente. Sin
-- fila = solicitud pendiente; decidir de nuevo pisa la decision anterior
-- (el historial completo de quien cambio que y cuando queda en logs_auditoria).
CREATE TABLE IF NOT EXISTS app.decisiones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solicitud_id UUID NOT NULL UNIQUE REFERENCES core.solicitudes (id),
    estado TEXT NOT NULL CHECK (estado IN ('aprobada', 'rechazada')),
    decidido_por UUID NOT NULL REFERENCES app.usuarios (id),
    decidido_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    motivo TEXT
);
CREATE INDEX IF NOT EXISTS idx_decisiones_solicitud ON app.decisiones (solicitud_id);

-- ---------------------------------------------------------------------------
-- Permisos del rol de la app (minimo privilegio). El rol se crea en
-- init_app_db.py porque su contrasenia viene del .env.
-- ---------------------------------------------------------------------------
REVOKE ALL ON SCHEMA raw FROM etike_app;      -- nunca ve datos en claro del pipeline
GRANT USAGE ON SCHEMA core, app TO etike_app;

-- core: solo lectura, y en solicitudes solo las columnas que la web muestra
-- ("id" es el UUID propio de la fila: se usa como identificador de solicitud
-- hacia el panel interno para no exponer nunca el sk_id_curr real)
GRANT SELECT ON core.scores, core.modelo_scorecard TO etike_app;
GRANT SELECT (id, sk_id_curr, ingreso_cifrado, fecha_nacimiento_cifrada) ON core.solicitudes TO etike_app;

-- app: la auditoria es de solo agregar (sin UPDATE ni DELETE)
GRANT SELECT, INSERT, UPDATE ON app.usuarios TO etike_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.sesiones TO etike_app;
GRANT SELECT, INSERT ON app.logs_auditoria TO etike_app;
GRANT USAGE ON SEQUENCE app.logs_auditoria_id_seq TO etike_app;
GRANT SELECT, INSERT, UPDATE ON app.decisiones TO etike_app;

-- la llave de cifrado viaja en el texto de las consultas (pgp_sym_decrypt):
-- se evita que Postgres escriba esas consultas en su log si fallan
ALTER ROLE etike_app SET log_min_error_statement = 'panic';
ALTER ROLE etike_app SET log_statement = 'none';
