# Explicacion del score y sugerencias de mejora.
#
# El scorecard es aditivo (score = base + suma de puntos por factor), asi que
# el efecto de cambiar un factor es exacto y no depende de los demas: permite
# sugerencias concretas ("pide X en vez de Y: +12 puntos") sin aproximaciones.

import bisect
import math
import threading

from . import db

_cache: dict = {}
_lock = threading.Lock()


def modelo_activo() -> dict:
    with _lock:
        if "modelo" not in _cache:
            with db.cursor() as cur:
                cur.execute("SELECT definicion FROM core.modelo_scorecard WHERE activo LIMIT 1")
                row = cur.fetchone()
            if not row:
                raise RuntimeError("No hay modelo activo: correr pipeline/score_model.py")
            m = row["definicion"]
            m["_factores"] = {f["id"]: f for f in m["factores"]}
            _cache["modelo"] = m
        return _cache["modelo"]


def tramo_de(factor: dict, valor) -> int:
    """Indice del tramo [a, b) donde cae el valor; -1 = sin dato."""
    if valor is None or (isinstance(valor, float) and math.isnan(valor)):
        return -1
    return bisect.bisect_right(factor["cortes"], valor)


def puntos_de(factor: dict, valor) -> int:
    i = tramo_de(factor, valor)
    if i < 0:
        return factor["nulo"]["puntos"] if factor["nulo"] else 0
    return factor["tramos"][i]["puntos"]


def explicar(modelo: dict, det: dict) -> list[dict]:
    out = []
    for f in modelo["factores"]:
        v = det["valores"].get(f["id"])
        out.append(dict(id=f["id"], valor=v, tramo=tramo_de(f, v), puntos=det["puntos"][f["id"]]))
    return out


def banda_de(modelo: dict, score: int) -> dict:
    return next(b for b in modelo["bandas"] if b["desde"] <= score < b["hasta"])


# --------------------------------------------------------------------------
# Sugerencias
# --------------------------------------------------------------------------

def _fmt_monto(x: float) -> str:
    return f"{x:,.0f}".replace(",", " ")


def _fmt_tiempo(anios: float) -> str:
    meses = max(1, math.ceil(anios * 12))
    if meses < 12:
        return f"{meses} {'mes' if meses == 1 else 'meses'}"
    a = meses / 12
    return f"{a:.0f} años" if a >= 2 else ("1 año" if meses == 12 else f"{meses} meses")


def sugerencias(modelo: dict, det: dict, score: int) -> list[dict]:
    F = modelo["_factores"]
    v, p, sol = det["valores"], det["puntos"], det["solicitud"]
    umbral = modelo["umbral_apto"]
    out = []

    def agregar(sid, factor_ids, titulo, detalle, ganancia, horizonte, cambios):
        if ganancia <= 0:
            return
        out.append(dict(id=sid, factores=factor_ids, titulo=titulo, detalle=detalle,
                        ganancia=int(ganancia), horizonte=horizonte, cambios=cambios,
                        nuevo_score=score + int(ganancia),
                        cruza_umbral=score < umbral <= score + ganancia))

    ingreso, monto = sol.get("ingreso"), sol.get("monto_credito")
    anualidad, precio = sol.get("anualidad"), sol.get("precio_bien")

    # 1) Pedir menos dinero: baja la cuota (misma cantidad de cuotas) y el
    #    sobre-financiamiento a la vez. Se busca el recorte mas chico que ya suma.
    if all(x for x in (ingreso, monto, anualidad, precio)) and "carga_cuota" in F and "credito_bien" in F:
        actual = p["carga_cuota"] + p["credito_bien"]
        mejor = None
        for pct in range(1, 51):
            k = 1 - pct / 100
            g = (puntos_de(F["carga_cuota"], anualidad * k / ingreso)
                 + puntos_de(F["credito_bien"], monto * k / precio)) - actual
            if g > 0:
                mejor = (pct, g)
                break
        if mejor:
            pct, g = mejor
            nuevo = monto * (1 - pct / 100)
            agregar("reducir_monto", ["carga_cuota", "credito_bien"],
                    f"Pide {_fmt_monto(nuevo)} en lugar de {_fmt_monto(monto)}",
                    f"Un recorte del {pct}% baja tu cuota a {_fmt_monto(anualidad * (1 - pct / 100))} "
                    f"y reduce lo que financias por encima del precio del bien.",
                    g, "inmediato", {"monto": round(nuevo)})

    # 2) Alargar el plazo: misma deuda, cuota mas baja -> solo mejora carga_cuota
    #    (cuotas = monto / cuota, igual que en el simulador de la web)
    if ingreso and anualidad and monto and "carga_cuota" in F:
        f = F["carga_cuota"]
        i = tramo_de(f, v["carga_cuota"])
        if i > 0:
            objetivo = f["cortes"][i - 1] - 0.005
            g = f["tramos"][i - 1]["puntos"] - p["carga_cuota"]
            nueva = objetivo * ingreso
            agregar("bajar_cuota", ["carga_cuota"],
                    f"Baja tu cuota a {_fmt_monto(nueva)}",
                    f"Con un plazo más largo tu cuota pasaría de {_fmt_monto(anualidad)} a {_fmt_monto(nueva)}: "
                    f"menos del {f['cortes'][i - 1] * 100:.0f}% de tu ingreso.",
                    g, "inmediato", {"cuotas": round(monto / nueva, 1)})

    # 3) Ponerse al dia con un atraso externo
    if v.get("atraso_actual") == 1:
        g = puntos_de(F["atraso_actual"], 0) - p["atraso_actual"]
        agregar("pagar_atraso", ["atraso_actual"], "Ponte al día con tu atraso vigente",
                "Tienes un crédito en otra entidad con días de atraso o monto vencido. Regularizarlo es el cambio "
                "con más impacto inmediato.", g, "inmediato", {"atraso_actual": 0})

    # 4) Bajar el uso de tus creditos activos
    u = v.get("uso_deuda")
    if u is not None and "uso_deuda" in F:
        f = F["uso_deuda"]
        i = tramo_de(f, u)
        deuda, lineas = sol.get("deuda_activa"), sol.get("monto_activo")
        if i > 0 and deuda and lineas:
            objetivo = max(f["cortes"][i - 1] - 0.005, 0)
            pago = max(deuda - objetivo * lineas, 0)
            g = f["tramos"][i - 1]["puntos"] - p["uso_deuda"]
            agregar("bajar_uso", ["uso_deuda"], f"Abona {_fmt_monto(pago)} a tus deudas activas",
                    f"Tu deuda usa el {u * 100:.0f}% de tus créditos activos. Bajarla a menos del "
                    f"{f['cortes'][i - 1] * 100:.0f}% muestra que no dependes del crédito al límite.",
                    g, "medio", {"uso_deuda": round(objetivo, 3)})

    # 5) Cerrar creditos activos
    n = v.get("creditos_activos")
    if n is not None and "creditos_activos" in F:
        f = F["creditos_activos"]
        i = tramo_de(f, n)
        if i > 0:
            objetivo = f["cortes"][i - 1] - 1
            k = int(n - objetivo)
            g = f["tramos"][i - 1]["puntos"] - p["creditos_activos"]
            agregar("cerrar_creditos", ["creditos_activos"],
                    f"Cancela {k} {'crédito activo' if k == 1 else 'créditos activos'}",
                    f"Hoy tienes {int(n)} créditos abiertos en otras entidades. Terminar de pagar "
                    f"{'uno' if k == 1 else k} te deja en el tramo «{f['tramos'][i - 1]['etiqueta']}».",
                    g, "medio", {"creditos_activos": objetivo})

    # 6) Factores que mejoran solos con el tiempo (estabilidad e historial)
    textos = {
        "anios_empleo": ("Mantén tu empleo actual", "si sigues en tu empleo actual"),
        "anios_telefono": ("Conserva tu número de contacto", "si mantienes el mismo número"),
        "antiguedad_historial": ("Deja madurar tu historial", "manteniendo tus créditos al día"),
    }
    for fid, (titulo, cond) in textos.items():
        val = v.get(fid)
        if fid not in F or val is None:
            continue
        f = F[fid]
        i = tramo_de(f, val)
        if i < len(f["tramos"]) - 1:
            falta = f["cortes"][i] - val
            g = f["tramos"][i + 1]["puntos"] - p[fid]
            agregar(f"tiempo_{fid}", [fid], titulo,
                    f"En {_fmt_tiempo(falta)}, {cond}, pasas al tramo «{f['tramos'][i + 1]['etiqueta']}».",
                    g, "largo", {fid: round(f["cortes"][i] + 0.01, 2)})

    orden_h = {"inmediato": 0, "medio": 1, "largo": 2}
    out.sort(key=lambda s: (not s["cruza_umbral"], orden_h[s["horizonte"]], -s["ganancia"]))
    return out


def plan_para_apto(modelo: dict, score: int, sugs: list[dict]) -> dict | None:
    """Combinacion mas corta de sugerencias (sin tocar el mismo factor dos
    veces) que lleva el score al umbral. Como el scorecard es aditivo, sumar
    las ganancias es exacto."""
    umbral = modelo["umbral_apto"]
    if score >= umbral:
        return None
    usados, pasos, total = set(), [], score
    for s in sorted(sugs, key=lambda s: -s["ganancia"]):
        if usados & set(s["factores"]):
            continue
        pasos.append(s["id"])
        usados |= set(s["factores"])
        total += s["ganancia"]
        if total >= umbral:
            return dict(alcanzable=True, pasos=pasos, score_final=total, faltan=umbral - score)
    return dict(alcanzable=False, pasos=pasos, score_final=total, faltan=umbral - score)
