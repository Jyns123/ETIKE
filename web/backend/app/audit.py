# Registro de auditoria: cada acceso a datos de un cliente queda anotado
# (quien, cuando, que accion, sobre que recurso, desde donde, si funciono).
# El rol de la app solo tiene INSERT/SELECT sobre esta tabla: no puede editar
# ni borrar registros, asi que un atacante que tome la app no borra su rastro.

import json

from fastapi import Request

from . import db
from .security import ip_de


def registrar(request: Request, accion: str, exito: bool = True, *, usuario: dict | None = None,
              nombre_usuario: str | None = None, recurso: str | None = None,
              objetivo: int | None = None, detalle: dict | None = None) -> None:
    with db.cursor() as cur:
        cur.execute(
            """INSERT INTO app.logs_auditoria
                 (usuario_id, usuario, accion, recurso, sk_id_curr_objetivo, exito, ip, user_agent, detalle)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                usuario["id"] if usuario else None,
                (usuario["usuario"] if usuario else nombre_usuario or "")[:60],
                accion, recurso, objetivo, exito, ip_de(request),
                request.headers.get("user-agent", "")[:300],
                json.dumps(detalle) if detalle else None,
            ),
        )
