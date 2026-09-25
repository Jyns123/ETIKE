# Pruebas de seguridad de punta a punta contra la app y la base reales: cada
# peticion pasa por el mismo camino que una del navegador (middleware anti-CSRF
# y de cabeceras, routers, RBAC, rol etike_app en Postgres). Funcionan como un
# pentest reproducible de los controles del proyecto.
#
# Requieren el pipeline corrido, web/backend/.env y las cuentas demo
# (scripts/seed_users.py). Sin base de datos se saltan. Como cualquier otra
# peticion, dejan su registro en app.logs_auditoria.

from contextlib import contextmanager

import psycopg2
import psycopg2.errors
import pytest
from fastapi.testclient import TestClient

from app import db, security
from app.config import settings
from app.main import app

ORIGEN = sorted(settings.allowed_origins)[0]


@pytest.fixture(scope="module")
def http():
    try:
        with TestClient(app, base_url="https://localhost:8443", client=("198.51.100.7", 0)) as c:
            yield c
    except (psycopg2.OperationalError, RuntimeError) as e:
        pytest.skip(f"sin base de datos lista: {e}")


@pytest.fixture(scope="module")
def cuentas(http):
    with db.cursor() as cur:
        cur.execute("SELECT id, usuario, rol, sk_id_curr FROM app.usuarios ORDER BY usuario")
        filas = cur.fetchall()
    por_rol: dict[str, list] = {}
    for f in filas:
        por_rol.setdefault(f["rol"], []).append(f)
    if len(por_rol.get("cliente", [])) < 2 or not por_rol.get("analista") or not por_rol.get("admin"):
        pytest.skip("faltan cuentas demo: correr scripts/seed_users.py")
    return por_rol


@contextmanager
def como(usuario: dict):
    """Sesion ya autenticada de `usuario` (el login real se prueba aparte)."""
    app.dependency_overrides[security.usuario_actual] = lambda: usuario
    try:
        yield
    finally:
        app.dependency_overrides.pop(security.usuario_actual, None)


def _desbloquear(usuario: str):
    with db.cursor() as cur:
        cur.execute("UPDATE app.usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE usuario = %s",
                    (usuario,))


# --------------------------------------------------------------------------
# Autenticacion
# --------------------------------------------------------------------------

def test_sin_sesion_no_hay_datos(http):
    assert http.get("/api/mi/score").status_code == 401
    assert http.get("/api/interno/resumen").status_code == 401


def test_login_no_revela_si_el_usuario_existe(http, cuentas):
    existente = cuentas["cliente"][0]["usuario"]
    try:
        a = http.post("/api/auth/login", json={"usuario": "no.existe.nadie", "password": "x" * 12},
                      headers={"Origin": ORIGEN})
        b = http.post("/api/auth/login", json={"usuario": existente, "password": "x" * 12},
                      headers={"Origin": ORIGEN})
    finally:
        _desbloquear(existente)
    assert a.status_code == b.status_code == 401
    assert a.json()["detail"] == b.json()["detail"]


def test_cuenta_se_bloquea_tras_5_fallos(http, cuentas):
    victima = cuentas["cliente"][-1]["usuario"]
    try:
        for _ in range(security.MAX_INTENTOS):
            r = http.post("/api/auth/login", json={"usuario": victima, "password": "incorrecta-123"},
                          headers={"Origin": ORIGEN})
            assert r.status_code == 401
        with db.cursor() as cur:
            cur.execute("SELECT bloqueado_hasta > now() AS bloqueada FROM app.usuarios WHERE usuario = %s", (victima,))
            assert cur.fetchone()["bloqueada"] is True
    finally:
        _desbloquear(victima)


def test_limite_de_intentos_por_ip(http, monkeypatch):
    monkeypatch.setattr(security, "limite_login", security.LimiteIP(maximo=3, ventana_s=60))
    for _ in range(3):
        r = http.post("/api/auth/login", json={"usuario": "no.existe.nadie", "password": "x"},
                      headers={"Origin": ORIGEN})
        assert r.status_code == 401
    r = http.post("/api/auth/login", json={"usuario": "no.existe.nadie", "password": "x"},
                  headers={"Origin": ORIGEN})
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) > 0


def test_error_de_validacion_no_refleja_la_contrasenia(http):
    secreto = "esta-contrasenia-no-debe-volver"
    r = http.post("/api/auth/login", json={"usuario": "ab", "password": secreto}, headers={"Origin": ORIGEN})
    assert r.status_code == 422
    assert secreto not in r.text


# --------------------------------------------------------------------------
# Control de acceso (RBAC, IDOR, pseudonimizacion)
# --------------------------------------------------------------------------

def test_cliente_no_accede_al_panel_interno(http, cuentas):
    with como(cuentas["cliente"][0]):
        for ruta in ("/api/interno/resumen", "/api/interno/solicitudes", "/api/interno/auditoria"):
            assert http.get(ruta).status_code == 403, ruta


def test_analista_no_ve_datos_de_clientes_ni_la_auditoria(http, cuentas):
    with como(cuentas["analista"][0]):
        for ruta in ("/api/mi/score", "/api/mi/datos", "/api/comunidad", "/api/interno/auditoria"):
            assert http.get(ruta).status_code == 403, ruta


def test_idor_un_id_en_la_url_se_ignora(http, cuentas):
    a, b = cuentas["cliente"][0], cuentas["cliente"][1]
    with como(a):
        propio = http.get("/api/mi/score").json()
        intento = http.get("/api/mi/score", params={"sk_id_curr": b["sk_id_curr"]}).json()
    assert intento["alias"] == propio["alias"]
    assert intento["score"] == propio["score"]


def test_solicitudes_del_analista_no_exponen_el_id_real(http, cuentas):
    with como(cuentas["analista"][0]):
        filas = http.get("/api/interno/solicitudes").json()
    assert filas
    assert all("sk_id_curr" not in f and f["alias"].startswith("CF-") for f in filas)


def test_descifrar_un_campo_no_permitido_se_niega_y_queda_auditado(http, cuentas):
    u = cuentas["cliente"][0]
    with como(u):
        r = http.post("/api/mi/datos/descifrar", json={"campo": "nacimiento"}, headers={"Origin": ORIGEN})
    assert r.status_code == 403
    with db.cursor() as cur:
        cur.execute("""SELECT accion, exito FROM app.logs_auditoria WHERE usuario_id = %s
                       ORDER BY id DESC LIMIT 1""", (u["id"],))
        assert cur.fetchone() == {"accion": "DESCIFRAR", "exito": False}


# --------------------------------------------------------------------------
# Seguridad de la aplicacion web
# --------------------------------------------------------------------------

def test_csrf_origen_ajeno_o_ausente_se_rechaza(http):
    assert http.post("/api/auth/logout", headers={"Origin": "https://sitio-malicioso.example"}).status_code == 403
    assert http.post("/api/auth/logout").status_code == 403


def test_cabeceras_de_seguridad(http):
    h = http.get("/api/salud").headers
    assert "default-src 'self'" in h["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in h["Content-Security-Policy"]
    assert "unsafe-inline" not in h["Content-Security-Policy"]
    assert h["Strict-Transport-Security"].startswith("max-age=")
    assert h["X-Frame-Options"] == "DENY"
    assert h["X-Content-Type-Options"] == "nosniff"
    assert h["Referrer-Policy"] == "no-referrer"
    assert h["Cache-Control"] == "no-store"


# --------------------------------------------------------------------------
# Base de datos: minimo privilegio del rol etike_app y cifrado en reposo
# --------------------------------------------------------------------------

@pytest.mark.parametrize("sql", [
    "SELECT 1 FROM raw.application_train_clean LIMIT 1",           # datos en claro del pipeline
    "SELECT target FROM core.solicitudes LIMIT 1",                   # columna no concedida
    "SELECT * FROM core.historial_bureau LIMIT 1",                   # tabla no concedida
    "UPDATE app.logs_auditoria SET exito = true WHERE id = -1",     # auditoria: sin UPDATE
    "DELETE FROM app.logs_auditoria WHERE id = -1",                  # auditoria: sin DELETE
    "CREATE TABLE app.puerta_trasera (x int)",                       # sin permisos de DDL
])
def test_rol_de_la_app_no_puede(http, sql):
    with pytest.raises(psycopg2.errors.InsufficientPrivilege):
        with db.cursor() as cur:
            cur.execute(sql)


def test_columnas_sensibles_cifradas_con_aes256(http):
    # 4o byte del paquete OpenPGP = algoritmo; 9 = AES-256 (RFC 4880, 9.2)
    with db.cursor() as cur:
        cur.execute("""SELECT count(*) FILTER (WHERE get_byte(ingreso_cifrado, 3) <> 9) AS ingreso,
                              count(*) FILTER (WHERE get_byte(fecha_nacimiento_cifrada, 3) <> 9) AS nacimiento
                       FROM core.solicitudes""")
        fuera = cur.fetchone()
        cur.execute("SELECT count(*) FILTER (WHERE get_byte(detalle_cifrado, 3) <> 9) AS detalle FROM core.scores")
        fuera.update(cur.fetchone())
    assert fuera == {"ingreso": 0, "nacimiento": 0, "detalle": 0}
