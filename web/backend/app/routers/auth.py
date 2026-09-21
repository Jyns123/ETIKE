from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from .. import audit, db, security

router = APIRouter(prefix="/api/auth", tags=["auth"])

# mensaje unico para cualquier fallo: no revela si el usuario existe o si la
# cuenta esta bloqueada (evita enumeracion de usuarios)
ERROR_GENERICO = "Usuario o contraseña incorrectos. Tras 5 intentos fallidos la cuenta se bloquea 15 minutos."


class LoginIn(BaseModel):
    usuario: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=1, max_length=128)


@router.post("/login")
def login(datos: LoginIn, request: Request, response: Response):
    ok, espera = security.limite_login.permitir(security.ip_de(request))
    if not ok:
        audit.registrar(request, "LOGIN_LIMITE_IP", False, nombre_usuario=datos.usuario)
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            f"Demasiados intentos desde tu red. Espera {espera} segundos.",
                            headers={"Retry-After": str(espera)})

    nombre = datos.usuario.strip().lower()
    with db.cursor() as cur:
        cur.execute(
            """SELECT id, usuario, password_hash, rol, sk_id_curr,
                      bloqueado_hasta IS NOT NULL AND bloqueado_hasta > now() AS bloqueado
               FROM app.usuarios WHERE usuario = %s""",
            (nombre,),
        )
        u = cur.fetchone()

    # se verifica SIEMPRE (con hash de relleno si no existe) para igualar tiempos
    valido = security.verificar_password(u["password_hash"] if u else None, datos.password)

    if not u or u["bloqueado"] or not valido:
        if u and not u["bloqueado"]:
            with db.cursor() as cur:
                cur.execute(
                    """UPDATE app.usuarios SET intentos_fallidos = intentos_fallidos + 1,
                           bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= %s THEN now() + %s END
                       WHERE id = %s""",
                    (security.MAX_INTENTOS, security.BLOQUEO, u["id"]),
                )
        motivo = "cuenta_bloqueada" if u and u["bloqueado"] else "credenciales"
        audit.registrar(request, "LOGIN", False, usuario=u, nombre_usuario=nombre, detalle={"motivo": motivo})
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, ERROR_GENERICO)

    with db.cursor() as cur:
        nuevo_hash = security.hash_password(datos.password) if security.necesita_rehash(u["password_hash"]) else None
        cur.execute(
            """UPDATE app.usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_login = now(),
                   password_hash = COALESCE(%s, password_hash)
               WHERE id = %s""",
            (nuevo_hash, u["id"]),
        )
    security.crear_sesion(response, u["id"], request)
    audit.registrar(request, "LOGIN", True, usuario=u)
    return {"usuario": u["usuario"], "rol": u["rol"]}


@router.post("/logout")
def logout(request: Request, response: Response):
    try:
        u = security.usuario_actual(request)
        audit.registrar(request, "LOGOUT", True, usuario=u)
    except HTTPException:
        pass
    security.cerrar_sesion(request, response)
    return {"ok": True}


@router.get("/sesion")
def sesion(u: dict = Depends(security.usuario_actual)):
    return {
        "usuario": u["usuario"], "rol": u["rol"],
        "expira_en": u["expira_en"].isoformat(), "idle_minutos": u["idle_minutos"],
    }
