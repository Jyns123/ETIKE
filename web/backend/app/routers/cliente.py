# Endpoints del cliente. Todos exigen sesion con rol "cliente" y solo operan
# sobre el sk_id_curr asociado a esa cuenta: no hay parametro de ID en la URL,
# asi que no se puede pedir el dato de otra persona (evita IDOR).

import base64
import hashlib
import hmac
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from .. import audit, db, scoring
from ..config import settings
from ..security import requiere_rol

router = APIRouter(prefix="/api", tags=["cliente"])
solo_cliente = requiere_rol("cliente")

# byte de algoritmo del paquete OpenPGP de clave simetrica (RFC 4880, 9.2)
ALGORITMOS_PGP = {7: "AES-128", 8: "AES-192", 9: "AES-256"}


def algoritmo_pgp(cifrado: bytes) -> str:
    # pgp_sym_encrypt empieza con un paquete tag 3: c3 <len> 04 <algoritmo> ...
    if len(cifrado) > 3 and cifrado[0] == 0xC3 and cifrado[2] == 4:
        return ALGORITMOS_PGP.get(cifrado[3], f"algoritmo {cifrado[3]}")
    return "desconocido"


def alias_de(sk_id_curr: int) -> str:
    """Pseudonimo estable (HMAC-SHA256 con llave del servidor): el mismo
    cliente siempre tiene el mismo alias, pero sin la llave no se puede
    volver al ID real ni enlazarlo con otras bases."""
    d = hmac.new(settings.pseudonym_key, str(sk_id_curr).encode(), hashlib.sha256).digest()
    b = base64.b32encode(d).decode()[:8]
    return f"CF-{b[:4]}-{b[4:]}"


@router.get("/modelo")
def modelo(_: dict = Depends(requiere_rol("cliente", "analista", "admin"))):
    return {k: v for k, v in scoring.modelo_activo().items() if not k.startswith("_")}


@router.get("/mi/score")
def mi_score(request: Request, u: dict = Depends(solo_cliente)):
    m = scoring.modelo_activo()
    with db.cursor() as cur:
        cur.execute(
            """SELECT s.score, s.banda, s.apto, s.tiene_historial,
                      s.pilar_capacidad, s.pilar_estabilidad, s.pilar_historial,
                      pgp_sym_decrypt(s.detalle_cifrado, %(key)s) AS detalle,
                      (SELECT count(*) FROM core.scores x WHERE x.score < s.score) AS debajo,
                      (SELECT count(*) FROM core.scores) AS total
               FROM core.scores s WHERE s.sk_id_curr = %(id)s""",
            {"key": settings.encryption_key, "id": u["sk_id_curr"]},
        )
        r = cur.fetchone()
    if not r:
        raise HTTPException(404, "Aún no hay un score calculado para tu cuenta")
    audit.registrar(request, "VER_SCORE", usuario=u, recurso="core.scores.detalle_cifrado",
                    objetivo=u["sk_id_curr"])

    det = json.loads(r["detalle"])
    sugs = scoring.sugerencias(m, det, r["score"])
    return {
        "alias": alias_de(u["sk_id_curr"]),
        "score": r["score"],
        "banda": r["banda"],
        "apto": r["apto"],
        "tiene_historial": r["tiene_historial"],
        "percentil": r["debajo"] / r["total"],
        "total_clientes": r["total"],
        "pilares": {"capacidad": r["pilar_capacidad"], "estabilidad": r["pilar_estabilidad"],
                    "historial": r["pilar_historial"]},
        "factores": scoring.explicar(m, det),
        "solicitud": det["solicitud"],
        "sugerencias": sugs,
        "plan": scoring.plan_para_apto(m, r["score"], sugs),
    }


@router.get("/mi/datos")
def mis_datos(request: Request, u: dict = Depends(solo_cliente)):
    """Como estan guardados tus datos sensibles: se devuelve el texto cifrado
    tal cual esta en la base (sin descifrar)."""
    with db.cursor() as cur:
        cur.execute(
            """SELECT s.ingreso_cifrado, s.fecha_nacimiento_cifrada, c.detalle_cifrado
               FROM core.solicitudes s JOIN core.scores c USING (sk_id_curr)
               WHERE s.sk_id_curr = %s""",
            (u["sk_id_curr"],),
        )
        r = cur.fetchone()
    audit.registrar(request, "VER_DATOS_CIFRADOS", usuario=u, objetivo=u["sk_id_curr"])
    campos = [
        ("ingreso", "Ingreso declarado", "core.solicitudes.ingreso_cifrado", r["ingreso_cifrado"], True,
         "Se usa para calcular qué parte de tu ingreso se iría en la cuota."),
        ("nacimiento", "Edad (días desde tu nacimiento)", "core.solicitudes.fecha_nacimiento_cifrada",
         r["fecha_nacimiento_cifrada"], False,
         "No se usa en tu score, así que la app nunca la descifra (minimización de datos)."),
        ("detalle", "Detalle de tu score", "core.scores.detalle_cifrado", r["detalle_cifrado"], True,
         "Los valores de cada factor. Se descifra solo cuando tú abres tu panel."),
    ]
    return [
        dict(id=cid, nombre=nombre, ubicacion=ubic, hex=bytes(b).hex(), bytes=len(b),
             algoritmo=algoritmo_pgp(bytes(b)), descifrable=desc, uso=uso)
        for cid, nombre, ubic, b, desc, uso in campos
    ]


class DescifrarIn(BaseModel):
    campo: str


@router.post("/mi/datos/descifrar")
def descifrar(datos: DescifrarIn, request: Request, u: dict = Depends(solo_cliente)):
    if datos.campo != "ingreso":
        audit.registrar(request, "DESCIFRAR", False, usuario=u, recurso=datos.campo[:60], objetivo=u["sk_id_curr"])
        raise HTTPException(403, "Este dato no se descifra: la app no lo necesita para tu score")
    with db.cursor() as cur:
        cur.execute("SELECT pgp_sym_decrypt(ingreso_cifrado, %s) AS v FROM core.solicitudes WHERE sk_id_curr = %s",
                    (settings.encryption_key, u["sk_id_curr"]))
        v = cur.fetchone()["v"]
    audit.registrar(request, "DESCIFRAR", usuario=u, recurso="core.solicitudes.ingreso_cifrado",
                    objetivo=u["sk_id_curr"])
    return {"campo": "ingreso", "valor": float(v)}


@router.get("/mi/actividad")
def mi_actividad(u: dict = Depends(solo_cliente)):
    """Quien accedio a tus datos: tus propias acciones y cualquier acceso del
    personal interno sobre tu registro."""
    with db.cursor() as cur:
        cur.execute(
            """SELECT l.ts, l.accion, l.recurso, l.exito, host(l.ip) AS ip,
                      CASE WHEN l.usuario_id = %(uid)s THEN 'Tú' ELSE COALESCE(us.rol, 'sistema') END AS quien
               FROM app.logs_auditoria l LEFT JOIN app.usuarios us ON us.id = l.usuario_id
               WHERE l.usuario_id = %(uid)s OR l.sk_id_curr_objetivo = %(sk)s
               ORDER BY l.ts DESC LIMIT 30""",
            {"uid": u["id"], "sk": u["sk_id_curr"]},
        )
        rows = cur.fetchall()
    return [dict(r, ts=r["ts"].isoformat()) for r in rows]


@router.get("/comunidad")
def comunidad(request: Request, u: dict = Depends(solo_cliente)):
    """Comparacion con otros clientes sin exponer a nadie: alias HMAC, score
    redondeado a decenas y el ingreso tal como esta guardado (cifrado)."""
    with db.cursor() as cur:
        cur.execute("SELECT score FROM core.scores WHERE sk_id_curr = %s", (u["sk_id_curr"],))
        mio = cur.fetchone()["score"]
        cur.execute(
            """SELECT c.sk_id_curr, c.score, c.banda, c.tiene_historial, s.ingreso_cifrado
               FROM core.scores c JOIN core.solicitudes s USING (sk_id_curr)
               WHERE c.score BETWEEN %(s)s - 40 AND %(s)s + 40 AND c.sk_id_curr <> %(id)s
               ORDER BY random() LIMIT 36""",
            {"s": mio, "id": u["sk_id_curr"]},
        )
        vecinos = cur.fetchall()
    audit.registrar(request, "VER_COMUNIDAD", usuario=u, recurso="core.scores (agregado)",
                    detalle={"vecinos": len(vecinos)})
    return {
        "vecinos": sorted(
            (dict(alias=alias_de(v["sk_id_curr"]), score_aprox=int(round(v["score"], -1)), banda=v["banda"],
                  tiene_historial=v["tiene_historial"],
                  # desde el byte 18: antes van cabeceras OpenPGP que se repiten entre filas
                  ingreso_cifrado=bytes(v["ingreso_cifrado"])[18:50].hex(),
                  algoritmo=algoritmo_pgp(bytes(v["ingreso_cifrado"])))
             for v in vecinos),
            key=lambda x: x["score_aprox"],
        ),
    }
