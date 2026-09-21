# Vistas del personal interno (RBAC): el analista ve indicadores agregados
# del negocio; solo el admin ve el registro de auditoria. Ninguno de los dos
# puede descifrar datos individuales desde la web.

from fastapi import APIRouter, Depends, Request

from .. import audit, db, scoring
from ..security import requiere_rol

router = APIRouter(prefix="/api/interno", tags=["interno"])


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
