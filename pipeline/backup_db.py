# Backup y restauracion de la BD (guia seccion 6: continuidad).
#
# pg_dump en formato "custom" (-Fc): queda comprimido y permite restaurar
# selectivo con pg_restore, a diferencia de un .sql plano. Se guarda en
# backups/ en la raiz del repo (no va a git, pesa como la BD).
#
#   python backup_db.py                              # backup + purga backups viejos
#   python backup_db.py --restore backups/archivo.dump
#
# RTO/RPO (con este script corriendo 1 vez al dia, ej. por cron):
#   RPO ~24h  -> como mucho se pierde lo cargado/calculado en las ultimas 24h
#   RTO ~5min -> restaurar un dump de este tamano (unos cientos de MB) con
#                pg_restore toma minutos, no horas
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
import os
import subprocess
import time
from pathlib import Path

from config import DB_CONFIG

BACKUPS = Path(__file__).resolve().parent.parent / "backups"
RETENCION_DIAS = 7
BIN_DIR = os.environ.get("PG_BIN_DIR", "")


def _bin(nombre: str) -> str:
    return str(Path(BIN_DIR) / nombre) if BIN_DIR else nombre


def _env_con_password() -> dict:
    env = os.environ.copy()
    if DB_CONFIG["password"]:
        env["PGPASSWORD"] = DB_CONFIG["password"]
    return env


def backup() -> None:
    BACKUPS.mkdir(exist_ok=True)
    destino = BACKUPS / f"homecredit_{time.strftime('%Y-%m-%d_%H%M')}.dump"
    subprocess.run(
        [_bin("pg_dump"), "-h", DB_CONFIG["host"], "-p", str(DB_CONFIG["port"]), "-U", DB_CONFIG["user"],
         "-Fc", "-f", str(destino), DB_CONFIG["dbname"]],
        env=_env_con_password(), check=True,
    )
    print(f"backup creado: {destino} ({destino.stat().st_size / 1e6:.1f} MB)")
    _purgar()


def _purgar() -> None:
    limite = time.time() - RETENCION_DIAS * 86400
    for f in BACKUPS.glob("homecredit_*.dump"):
        if f.stat().st_mtime < limite:
            f.unlink()
            print(f"borrado (más de {RETENCION_DIAS} días): {f.name}")


def restore(archivo: str) -> None:
    subprocess.run(
        [_bin("pg_restore"), "-h", DB_CONFIG["host"], "-p", str(DB_CONFIG["port"]), "-U", DB_CONFIG["user"],
         "-d", DB_CONFIG["dbname"], "--clean", "--if-exists", archivo],
        env=_env_con_password(), check=True,
    )
    print(f"restaurado desde: {archivo}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--restore", metavar="ARCHIVO", help="restaura ese backup en vez de crear uno nuevo")
    args = ap.parse_args()
    restore(args.restore) if args.restore else backup()
