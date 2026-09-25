# Configuracion de la app web. Todo sale de variables de entorno (o de
# web/backend/.env), nada sensible queda en el codigo.

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


def _req(name: str) -> str:
    val = os.environ.get(name)
    if not val or val == "cambiar":
        raise RuntimeError(f"Falta la variable de entorno {name} (ver web/backend/.env.example)")
    return val


def _path(name: str, default: str) -> Path:
    p = Path(os.environ.get(name, default))
    return p if p.is_absolute() else (BACKEND_DIR / p).resolve()


@dataclass(frozen=True)
class Settings:
    db: dict
    encryption_key: str
    pseudonym_key: bytes
    session_idle_minutes: int
    session_absolute_hours: int
    allowed_origins: frozenset
    tls_cert: Path
    tls_key: Path
    host: str
    port: int
    frontend_dist: Path


def load_settings() -> Settings:
    return Settings(
        db=dict(
            host=os.environ.get("APP_DB_HOST", "localhost"),
            port=os.environ.get("APP_DB_PORT", "5433"),
            dbname=os.environ.get("APP_DB_NAME", "homecredit"),
            user=os.environ.get("APP_DB_USER", "etike_app"),
            password=_req("APP_DB_PASSWORD"),
            application_name="etike-web",
        ),
        encryption_key=_req("HC_ENCRYPTION_KEY"),
        pseudonym_key=_req("PSEUDONYM_KEY").encode(),
        session_idle_minutes=int(os.environ.get("SESSION_IDLE_MINUTES", "30")),
        session_absolute_hours=int(os.environ.get("SESSION_ABSOLUTE_HOURS", "8")),
        allowed_origins=frozenset(
            o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "https://localhost:8443").split(",") if o.strip()
        ),
        tls_cert=_path("TLS_CERT", "../certs/server.crt"),
        tls_key=_path("TLS_KEY", "../certs/server.key"),
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8443")),
        frontend_dist=(BACKEND_DIR.parent / "frontend" / "dist").resolve(),
    )


settings = load_settings()
