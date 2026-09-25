# Pruebas puras de app/security.py: no tocan la BD (hash de contrasenias,
# limite de intentos por IP y el chequeo de rol son logica en memoria).

import pytest
from fastapi import HTTPException

from app import security


def test_hash_password_roundtrip():
    h = security.hash_password("una-contrasenia-larga")
    assert security.verificar_password(h, "una-contrasenia-larga") is True


def test_hash_password_rechaza_contrasenia_incorrecta():
    h = security.hash_password("una-contrasenia-larga")
    assert security.verificar_password(h, "otra-cosa") is False


def test_verificar_password_usuario_inexistente_no_lanza_excepcion():
    """Si el usuario no existe se verifica igual contra un hash de relleno
    (mismo tiempo de respuesta, evita enumeracion de usuarios): no debe
    crashear ni dar True nunca."""
    assert security.verificar_password(None, "cualquier-cosa") is False


def test_requiere_rol_permite_el_rol_correcto():
    dep = security.requiere_rol("analista", "admin")
    usuario = {"rol": "admin"}
    assert dep(usuario=usuario) is usuario


def test_requiere_rol_rechaza_rol_incorrecto():
    dep = security.requiere_rol("analista", "admin")
    with pytest.raises(HTTPException) as exc:
        dep(usuario={"rol": "cliente"})
    assert exc.value.status_code == 403


def test_limite_ip_bloquea_tras_el_maximo_de_intentos():
    lim = security.LimiteIP(maximo=3, ventana_s=60)
    ip = "203.0.113.5"
    for _ in range(3):
        ok, _ = lim.permitir(ip)
        assert ok is True
    ok, espera = lim.permitir(ip)
    assert ok is False
    assert espera > 0


def test_limite_ip_no_mezcla_ips_distintas():
    lim = security.LimiteIP(maximo=1, ventana_s=60)
    ok1, _ = lim.permitir("203.0.113.1")
    ok2, _ = lim.permitir("203.0.113.2")
    assert ok1 is True
    assert ok2 is True
