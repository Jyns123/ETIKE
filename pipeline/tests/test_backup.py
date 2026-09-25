# Cifrado de los backups (backup_db.py). No necesitan la BD: prueban el
# formato AES-256-GCM con datos sinteticos.

import base64
import io
import os

import pytest

import backup_db

LLAVE = bytes(range(32))


def _backup(tmp_path, datos: bytes, llave: bytes = LLAVE):
    ruta = tmp_path / "prueba.dump.enc"
    with open(ruta, "wb") as f:
        backup_db.cifrar(io.BytesIO(datos), f, llave)
    return ruta


def test_ida_y_vuelta_en_varios_bloques(tmp_path):
    datos = os.urandom(3 * backup_db.BLOQUE + 123)
    salida = io.BytesIO()
    backup_db.descifrar(_backup(tmp_path, datos), LLAVE, salida)
    assert salida.getvalue() == datos


def test_el_archivo_no_contiene_texto_en_claro(tmp_path):
    datos = b"AMT_INCOME_TOTAL;202500.0;" * 2000
    assert b"AMT_INCOME_TOTAL" not in _backup(tmp_path, datos).read_bytes()


def test_detecta_un_byte_alterado(tmp_path):
    ruta = _backup(tmp_path, b"x" * 5000)
    contenido = bytearray(ruta.read_bytes())
    contenido[100] ^= 1
    ruta.write_bytes(contenido)
    with pytest.raises(SystemExit, match="modificado"):
        backup_db.descifrar(ruta, LLAVE)


def test_detecta_la_cabecera_alterada(tmp_path):
    # el nonce va como dato asociado: cambiarlo tambien invalida el tag
    ruta = _backup(tmp_path, b"x" * 5000)
    contenido = bytearray(ruta.read_bytes())
    contenido[len(backup_db.MAGIC)] ^= 1
    ruta.write_bytes(contenido)
    with pytest.raises(SystemExit, match="modificado"):
        backup_db.descifrar(ruta, LLAVE)


def test_rechaza_otra_llave(tmp_path):
    with pytest.raises(SystemExit, match="llave"):
        backup_db.descifrar(_backup(tmp_path, b"x" * 5000), bytes(32))


def test_rechaza_un_dump_sin_cifrar(tmp_path):
    ruta = tmp_path / "viejo.dump"
    ruta.write_bytes(b"PGDMP" + b"\x00" * 100)
    with pytest.raises(SystemExit, match="no es un backup cifrado"):
        backup_db.descifrar(ruta, LLAVE)


def test_cada_backup_usa_un_nonce_distinto(tmp_path):
    a = _backup(tmp_path, b"mismo contenido").read_bytes()
    b = _backup(tmp_path, b"mismo contenido").read_bytes()
    assert a != b


def test_llave_debe_tener_32_bytes():
    with pytest.raises(SystemExit):
        backup_db.llave_de("corta")
    assert backup_db.llave_de(base64.urlsafe_b64encode(LLAVE).rstrip(b"=").decode()) == LLAVE
