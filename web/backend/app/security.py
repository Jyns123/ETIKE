# Autenticacion y sesiones.
#
# - Contrasenias: Argon2id (ganador de la Password Hashing Competition,
#   recomendado por OWASP). Cada hash lleva su propia sal aleatoria y sus
#   parametros, asi que se pueden endurecer despues sin romper nada
#   (check_needs_rehash re-hashea al siguiente login).
# - Sesiones del lado del servidor: el navegador recibe un token aleatorio de
#   256 bits en una cookie HttpOnly + Secure + SameSite=Strict (__Host-). En la
#   base solo se guarda su SHA-256: si alguien roba la tabla de sesiones, no
#   puede usarla para entrar.
# - Bloqueo: 5 intentos fallidos bloquean la cuenta 15 minutos, y ademas hay
#   un limite por IP para frenar fuerza bruta distribuida entre cuentas.

import hashlib
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response, status

from . import db
from .config import settings

COOKIE_NAME = "__Host-cf_sesion"
MAX_INTENTOS = 5
BLOQUEO = timedelta(minutes=15)

_ph = PasswordHasher()  # Argon2id, parametros por defecto de RFC 9106
# hash de relleno: si el usuario no existe igual se verifica contra algo, para
# que el tiempo de respuesta no revele que usuarios existen
_HASH_RELLENO = _ph.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verificar_password(password_hash: str | None, password: str) -> bool:
    try:
        return _ph.verify(password_hash or _HASH_RELLENO, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def necesita_rehash(password_hash: str) -> bool:
    return _ph.check_needs_rehash(password_hash)


def _hash_token(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


# --------------------------------------------------------------------------
# Limite de intentos por IP (en memoria: suficiente para una sola instancia)
# --------------------------------------------------------------------------

class LimiteIP:
    def __init__(self, maximo: int, ventana_s: int):
        self.maximo, self.ventana = maximo, ventana_s
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def permitir(self, ip: str) -> tuple[bool, int]:
        ahora = time.monotonic()
        with self._lock:
            q = self._hits[ip]
            while q and ahora - q[0] > self.ventana:
                q.popleft()
            if len(q) >= self.maximo:
                return False, int(self.ventana - (ahora - q[0])) + 1
            q.append(ahora)
            return True, 0


limite_login = LimiteIP(maximo=10, ventana_s=300)


# --------------------------------------------------------------------------
# Sesiones
# --------------------------------------------------------------------------

def crear_sesion(response: Response, usuario_id, request: Request) -> None:
    token = secrets.token_urlsafe(32)
    absoluta = datetime.now(timezone.utc) + timedelta(hours=settings.session_absolute_hours)
    with db.cursor() as cur:
        # una sesion activa por usuario: iniciar sesion invalida las anteriores
        cur.execute("DELETE FROM app.sesiones WHERE usuario_id = %s OR expira_en < now()", (usuario_id,))
        cur.execute(
            """INSERT INTO app.sesiones (token_hash, usuario_id, expira_en, ip, user_agent)
               VALUES (%s, %s, %s, %s, %s)""",
            (_hash_token(token), usuario_id, absoluta, ip_de(request), request.headers.get("user-agent", "")[:300]),
        )
    response.set_cookie(
        COOKIE_NAME, token,
        max_age=settings.session_absolute_hours * 3600,
        secure=True, httponly=True, samesite="strict", path="/",
    )


def cerrar_sesion(request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        with db.cursor() as cur:
            cur.execute("DELETE FROM app.sesiones WHERE token_hash = %s", (_hash_token(token),))
    response.delete_cookie(COOKIE_NAME, path="/", secure=True, httponly=True, samesite="strict")


def ip_de(request: Request) -> str:
    return request.client.host if request.client else "0.0.0.0"


def usuario_actual(request: Request) -> dict:
    """Dependencia de FastAPI: valida la cookie y devuelve el usuario. Renueva
    la inactividad en cada peticion (expiracion deslizante)."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión no iniciada")
    idle = timedelta(minutes=settings.session_idle_minutes)
    with db.cursor() as cur:
        cur.execute(
            """UPDATE app.sesiones s SET ultima_actividad = now()
               FROM app.usuarios u
               WHERE s.token_hash = %s AND u.id = s.usuario_id
                 AND s.expira_en > now() AND s.ultima_actividad > now() - %s
               RETURNING u.id, u.usuario, u.rol, u.sk_id_curr, s.creada_en, s.expira_en""",
            (_hash_token(token), idle),
        )
        row = cur.fetchone()
        if not row:
            cur.execute("DELETE FROM app.sesiones WHERE token_hash = %s", (_hash_token(token),))
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión expirada")
    row["idle_minutos"] = settings.session_idle_minutes
    return row


def requiere_rol(*roles: str):
    def dep(usuario: dict = Depends(usuario_actual)) -> dict:
        if usuario["rol"] not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes permiso para este recurso")
        return usuario
    return dep
