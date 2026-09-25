# Backup y restauracion CIFRADOS de la BD (guia seccion 6: continuidad).
#
# pg_dump en formato "custom" (-Fc): queda comprimido y se restaura con
# pg_restore. La salida de pg_dump nunca toca el disco en claro: se lee por un
# pipe y se cifra al vuelo con AES-256-GCM. GCM es cifrado autenticado: si
# alguien modifica el archivo, o se usa otra llave, el restore lo detecta y se
# niega a restaurar. Se guarda en backups/ en la raiz del repo (no va a git).
#
# Por que cifrar: el dump incluye el schema raw (copia en claro de los csv,
# con el ingreso, que la Ley 29733 considera dato sensible) y las tablas de la
# app (hashes de contrasenias, auditoria con IPs). Sin cifrar, quien consiga
# el archivo lee todo sin necesitar la llave de pgcrypto.
#
# Llave: BACKUP_KEY en pipeline/.env (32 bytes aleatorios en base64url). Es
# DISTINTA de HC_ENCRYPTION_KEY: si se filtra una, la otra sigue protegiendo lo
# suyo. Guardar una copia FUERA del servidor (gestor de contrasenias del
# equipo): sin ella los backups son irrecuperables, y si vive junto a ellos no
# protege nada.
#
#   python backup_db.py --generar-llave                    # una vez: agrega BACKUP_KEY a .env
#   python backup_db.py                                    # backup cifrado + purga backups viejos
#   python backup_db.py --verificar backups/archivo.dump.enc   # integridad, sin restaurar
#   python backup_db.py --restore backups/archivo.dump.enc
#
# Formato: "CFBKUP01" (8 bytes) | nonce (12) | datos cifrados | tag GCM (16).
# La cabecera va como dato asociado: tambien queda autenticada.
#
# RTO/RPO (con este script corriendo 1 vez al dia, ej. por cron):
#   RPO ~24h  -> como mucho se pierde lo cargado/calculado en las ultimas 24h
#   RTO ~5min -> restaurar un dump de este tamano (unos cientos de MB) con
#                pg_restore toma minutos, no horas (descifrar AES-GCM es mucho
#                mas rapido que el restore en si)
#
# Cron de ejemplo (todos los dias 3am): agregar con `crontab -e`
#   0 3 * * * cd /ruta/al/repo/pipeline && /usr/bin/python3 backup_db.py >> backup.log 2>&1
#
# Si tenes mas de un Postgres instalado (comun en Mac con Homebrew + instalador
# EDB), pg_dump/pg_restore del PATH puede ser de otra version que el servidor
# ("server version: 16.0; pg_dump version: 14.17" o similar): pg_dump exige
# que las versiones mayores coincidan. Solucion: setear PG_BIN_DIR en el .env
# apuntando a la carpeta bin del Postgres correcto (la misma que usarias para
# psql/createdb, ver pipeline/README.md).

import argparse
import base64
import os
import secrets
import subprocess
import time
from pathlib import Path
from typing import BinaryIO

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from config import DB_CONFIG

BACKUPS = Path(__file__).resolve().parent.parent / "backups"
ENV = Path(__file__).resolve().parent / ".env"
RETENCION_DIAS = 7
BIN_DIR = os.environ.get("PG_BIN_DIR", "")

MAGIC = b"CFBKUP01"
NONCE, TAG = 12, 16
BLOQUE = 1 << 20  # se cifra de a 1 MiB: el dump nunca esta entero en memoria


def _bin(nombre: str) -> str:
    return str(Path(BIN_DIR) / nombre) if BIN_DIR else nombre


def _env_con_password() -> dict:
    env = os.environ.copy()
    if DB_CONFIG["password"]:
        env["PGPASSWORD"] = DB_CONFIG["password"]
    return env


def _conexion() -> list[str]:
    return ["-h", DB_CONFIG["host"], "-p", str(DB_CONFIG["port"]), "-U", DB_CONFIG["user"]]


def llave_de(valor: str) -> bytes:
    try:
        llave = base64.urlsafe_b64decode(valor + "=" * (-len(valor) % 4))
    except ValueError:
        llave = b""
    if len(llave) != 32:
        raise SystemExit("Falta BACKUP_KEY (32 bytes en base64url) en pipeline/.env: "
                         "generarla con  python backup_db.py --generar-llave")
    return llave


def cifrar(origen: BinaryIO, destino: BinaryIO, llave: bytes) -> None:
    nonce = secrets.token_bytes(NONCE)  # nunca se repite con la misma llave
    enc = Cipher(algorithms.AES(llave), modes.GCM(nonce)).encryptor()
    enc.authenticate_additional_data(MAGIC + nonce)
    destino.write(MAGIC + nonce)
    while bloque := origen.read(BLOQUE):
        destino.write(enc.update(bloque))
    destino.write(enc.finalize() + enc.tag)


def descifrar(archivo: Path, llave: bytes, salida: BinaryIO | None = None) -> None:
    """Descifra por bloques hacia `salida`. Sin salida solo verifica el tag.
    Ojo: GCM entrega texto antes de validar el tag, por eso restore() verifica
    primero en una pasada aparte y recien despues escribe en la BD."""
    cabecera = len(MAGIC) + NONCE
    tam = archivo.stat().st_size
    with open(archivo, "rb") as f:
        inicio = f.read(cabecera)
        if tam < cabecera + TAG or inicio[:len(MAGIC)] != MAGIC:
            raise SystemExit(f"{archivo} no es un backup cifrado por este script")
        f.seek(tam - TAG)
        tag = f.read(TAG)
        f.seek(cabecera)
        dec = Cipher(algorithms.AES(llave), modes.GCM(inicio[len(MAGIC):], tag)).decryptor()
        dec.authenticate_additional_data(inicio)
        restante = tam - cabecera - TAG
        while restante:
            bloque = f.read(min(BLOQUE, restante))
            restante -= len(bloque)
            claro = dec.update(bloque)
            if salida:
                salida.write(claro)
        try:
            dec.finalize()
        except InvalidTag:
            raise SystemExit(f"{archivo}: fue modificado o la llave no es la correcta (tag GCM inválido)") from None


def backup() -> None:
    llave = llave_de(os.environ.get("BACKUP_KEY", ""))
    BACKUPS.mkdir(exist_ok=True)
    destino = BACKUPS / f"homecredit_{time.strftime('%Y-%m-%d_%H%M')}.dump.enc"
    parcial = destino.with_name(destino.name + ".parcial")
    try:
        with subprocess.Popen([_bin("pg_dump"), *_conexion(), "-Fc", DB_CONFIG["dbname"]],
                              stdout=subprocess.PIPE, env=_env_con_password()) as proc:
            with open(parcial, "wb") as f:
                cifrar(proc.stdout, f, llave)
        if proc.returncode != 0:
            raise SystemExit("pg_dump falló: no se guardó ningún backup")
    except BaseException:
        parcial.unlink(missing_ok=True)
        raise
    parcial.replace(destino)  # solo aparece con su nombre final si quedo completo
    print(f"backup cifrado (AES-256-GCM): {destino} ({destino.stat().st_size / 1e6:.1f} MB)")
    _purgar()


def _purgar() -> None:
    limite = time.time() - RETENCION_DIAS * 86400
    for f in BACKUPS.glob("homecredit_*.dump.enc"):
        if f.stat().st_mtime < limite:
            f.unlink()
            print(f"borrado (más de {RETENCION_DIAS} días): {f.name}")
    for f in BACKUPS.glob("homecredit_*.dump"):
        print(f"AVISO: {f.name} es un backup SIN cifrar (versión anterior del script): borrarlo")


def verificar(archivo: str) -> None:
    descifrar(Path(archivo), llave_de(os.environ.get("BACKUP_KEY", "")))
    print(f"integridad OK (AES-256-GCM): {archivo}")


def restore(archivo: str) -> None:
    ruta = Path(archivo)
    llave = llave_de(os.environ.get("BACKUP_KEY", ""))
    descifrar(ruta, llave)  # 1a pasada: un archivo alterado no llega a tocar la BD
    print("integridad OK, restaurando...")
    with subprocess.Popen([_bin("pg_restore"), *_conexion(), "-d", DB_CONFIG["dbname"], "--clean", "--if-exists"],
                          stdin=subprocess.PIPE, env=_env_con_password()) as proc:
        try:
            descifrar(ruta, llave, proc.stdin)  # el texto en claro va directo a pg_restore, sin disco
        except BrokenPipeError:
            pass  # pg_restore termino antes: su codigo de salida dice por que
        finally:
            proc.stdin.close()
    if proc.returncode != 0:
        raise SystemExit(f"pg_restore terminó con código {proc.returncode}")
    print(f"restaurado desde: {archivo}")


def generar_llave() -> None:
    contenido = ENV.read_text(encoding="utf-8") if ENV.exists() else ""
    if any(linea.startswith("BACKUP_KEY=") for linea in contenido.splitlines()):
        # pisarla dejaria ilegibles los backups hechos con la anterior
        raise SystemExit(f"{ENV} ya tiene BACKUP_KEY: no se reemplaza")
    llave = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
    separador = "" if not contenido or contenido.endswith("\n") else "\n"
    ENV.write_text(f"{contenido}{separador}BACKUP_KEY={llave}\n", encoding="utf-8")
    print(f"BACKUP_KEY agregada a {ENV}.\n"
          "Guardar una copia FUERA de este servidor (gestor de contraseñas del equipo): "
          "sin ella los backups no se pueden restaurar.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Backup/restore cifrado (AES-256-GCM) de la BD")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--restore", metavar="ARCHIVO", help="verifica y restaura ese backup")
    g.add_argument("--verificar", metavar="ARCHIVO", help="solo comprueba integridad y llave")
    g.add_argument("--generar-llave", action="store_true", help="agrega una BACKUP_KEY nueva a pipeline/.env")
    args = ap.parse_args()
    if args.generar_llave:
        generar_llave()
    elif args.restore:
        restore(args.restore)
    elif args.verificar:
        verificar(args.verificar)
    else:
        backup()
