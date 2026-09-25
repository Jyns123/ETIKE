# El diseno anti-IDOR del proyecto es arquitectonico: ningun endpoint de
# cliente recibe un ID en la URL, el cliente siempre sale de la sesion (ver
# routers/cliente.py). Estas pruebas verifican esa garantia a nivel de codigo:
# si alguien agrega sin querer un endpoint tipo "/mi/score/{sk_id_curr}", el
# test falla.

import pytest
from fastapi import HTTPException

from app.routers import cliente, interno


def _tiene_parametro_de_ruta(router) -> list[str]:
    return [r.path for r in router.routes if "{" in r.path]


def test_ningun_endpoint_de_cliente_recibe_id_en_la_url():
    con_parametro = _tiene_parametro_de_ruta(cliente.router)
    assert con_parametro == [], f"endpoint(s) de cliente con ID en la URL (riesgo IDOR): {con_parametro}"


def test_endpoints_internos_de_lectura_no_reciben_id_de_cliente():
    """El unico parametro de ruta permitido en el panel interno es el UUID de
    la SOLICITUD (para decidir aprobar/rechazar), nunca un sk_id_curr: la
    lista de solicitudes ya sale pseudonimizada (alias), y el analista nunca
    ve el identificador real del cliente."""
    con_parametro = _tiene_parametro_de_ruta(interno.router)
    assert con_parametro == ["/api/interno/solicitudes/{solicitud_id}/decision"]


def test_alias_es_estable_para_el_mismo_cliente():
    assert cliente.alias_de(100002) == cliente.alias_de(100002)


def test_alias_distingue_clientes_distintos():
    assert cliente.alias_de(100002) != cliente.alias_de(100003)


def test_alias_no_expone_el_id_real():
    alias = cliente.alias_de(100002)
    assert "100002" not in alias


def test_algoritmo_pgp_detecta_aes256():
    # c3 <len> 04 09 ...: paquete OpenPGP simetrico, algoritmo 9 = AES-256
    cifrado = bytes([0xC3, 0x0D, 0x04, 0x09]) + b"\x00" * 10
    assert cliente.algoritmo_pgp(cifrado) == "AES-256"


def test_decision_de_solicitud_exige_rol_analista_o_admin():
    with pytest.raises(HTTPException) as exc:
        interno.solo_interno(usuario={"rol": "cliente"})
    assert exc.value.status_code == 403
    assert interno.solo_interno(usuario={"rol": "analista"})["rol"] == "analista"
