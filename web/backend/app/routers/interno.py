# Vistas del personal interno (RBAC): el analista ve indicadores agregados
# del negocio y decide solicitudes (aprobar/rechazar); solo el admin ve el
# registro de auditoria. Ninguno de los dos puede descifrar datos individuales
# desde la web: la lista de solicitudes muestra el alias pseudonimizado y el
# score, nunca el sk_id_curr real ni un campo cifrado.

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import audit, db, scoring
from ..security import requiere_rol
from .cliente import alias_de

router = APIRouter(prefix="/api/interno", tags=["interno"])
solo_interno = requiere_rol("analista", "admin")
ESTADOS = {"pendiente", "aprobada", "rechazada", "todas"}


@router.get("/resumen")
def resumen(request: Request, u: dict = Depends(requiere_rol("analista", "admin"))):
    m = scoring.modelo_activo()
    with db.cursor() as cur:
        cur.execute(
            """SELECT banda, tiene_historial, count(*) AS n, avg(score)::float AS score_medio
               FROM core.scores GROUP BY banda, tiene_historial"""
        )
        grupos = cur.fetchall()
        cur.execute(
            """SELECT count(*) FILTER (WHERE accion = 'LOGIN' AND exito) AS logins_ok,
                      count(*) FILTER (WHERE accion = 'LOGIN' AND NOT exito) AS logins_fallidos,
                      count(*) FILTER (WHERE accion LIKE 'DESCIFRAR%%') AS descifrados
               FROM app.logs_auditoria WHERE ts > now() - interval '24 hours'"""
        )
        seg = cur.fetchone()
    audit.registrar(request, "VER_RESUMEN_INTERNO", usuario=u, recurso="core.scores (agregado)")
    return {"grupos": grupos, "seguridad_24h": seg, "metricas": m["metricas"],
            "comparacion": m["comparacion"], "umbral_apto": m["umbral_apto"], "version": m["version"]}


@router.get("/auditoria")
def auditoria(request: Request, u: dict = Depends(requiere_rol("admin"))):
    with db.cursor() as cur:
        cur.execute(
            """SELECT l.id, l.ts, l.usuario, us.rol, l.accion, l.recurso, l.exito, host(l.ip) AS ip,
                      l.sk_id_curr_objetivo IS NOT NULL AS sobre_cliente
               FROM app.logs_auditoria l LEFT JOIN app.usuarios us ON us.id = l.usuario_id
               ORDER BY l.ts DESC LIMIT 200"""
        )
        rows = cur.fetchall()
    audit.registrar(request, "VER_AUDITORIA", usuario=u, recurso="app.logs_auditoria")
    return [dict(r, ts=r["ts"].isoformat()) for r in rows]


@router.get("/solicitudes")
def solicitudes(request: Request, estado: str = "pendiente", u: dict = Depends(solo_interno)):
    if estado not in ESTADOS:
        raise HTTPException(422, f"estado debe ser uno de {sorted(ESTADOS)}")
    with db.cursor() as cur:
        cur.execute(
            """SELECT s.id AS solicitud_id, s.sk_id_curr, c.score, c.banda, c.apto, c.tiene_historial,
                      d.estado, d.decidido_en, du.usuario AS decidido_por
               FROM core.solicitudes s
               JOIN core.scores c USING (sk_id_curr)
               LEFT JOIN app.decisiones d ON d.solicitud_id = s.id
               LEFT JOIN app.usuarios du ON du.id = d.decidido_por
               WHERE %(estado)s = 'todas'
                  OR (%(estado)s = 'pendiente' AND d.id IS NULL)
                  OR d.estado = %(estado)s
               ORDER BY c.score ASC
               LIMIT 100""",
            {"estado": estado},
        )
        rows = cur.fetchall()
    audit.registrar(request, "VER_SOLICITUDES", usuario=u, recurso="core.solicitudes (agregado)",
                    detalle={"estado": estado, "n": len(rows)})
    return [
        dict(id=str(r["solicitud_id"]), alias=alias_de(r["sk_id_curr"]), score=r["score"], banda=r["banda"],
             apto=r["apto"], tiene_historial=r["tiene_historial"], estado=r["estado"] or "pendiente",
             decidido_en=r["decidido_en"].isoformat() if r["decidido_en"] else None, decidido_por=r["decidido_por"])
        for r in rows
    ]


class DecisionIn(BaseModel):
    estado: str = Field(pattern="^(aprobada|rechazada)$")
    motivo: str | None = Field(default=None, max_length=300)


@router.post("/solicitudes/{solicitud_id}/decision")
def decidir(solicitud_id: uuid.UUID, datos: DecisionIn, request: Request, u: dict = Depends(solo_interno)):
    with db.cursor() as cur:
        cur.execute("SELECT sk_id_curr FROM core.solicitudes WHERE id = %s", (str(solicitud_id),))
        s = cur.fetchone()
        if not s:
            raise HTTPException(404, "Solicitud no encontrada")
        cur.execute(
            """INSERT INTO app.decisiones (solicitud_id, estado, decidido_por, motivo)
               VALUES (%(sid)s, %(estado)s, %(uid)s, %(motivo)s)
               ON CONFLICT (solicitud_id) DO UPDATE
                 SET estado = EXCLUDED.estado, decidido_por = EXCLUDED.decidido_por,
                     decidido_en = now(), motivo = EXCLUDED.motivo""",
            {"sid": str(solicitud_id), "estado": datos.estado, "uid": u["id"], "motivo": datos.motivo},
        )
    audit.registrar(request, "DECISION_SOLICITUD", usuario=u, recurso="app.decisiones",
                    objetivo=s["sk_id_curr"], detalle={"estado": datos.estado, "motivo": datos.motivo})
    return {"ok": True}
