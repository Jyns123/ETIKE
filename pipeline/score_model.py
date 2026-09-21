# Paso 3 del pipeline: entrena el "Score CrediFacil", un scorecard transparente,
# y lo guarda en el schema core para que la web lo explique al cliente.
#
#   core.modelo_scorecard : definicion completa del modelo en JSONB (tramos de
#                           cada factor, puntos, metricas, comparacion etica).
#                           No es secreto: la web se lo muestra al cliente.
#   core.scores           : 1 fila por cliente con su score y puntos por pilar.
#                           El detalle (valores de cada factor, ingreso, montos)
#                           va CIFRADO con pgcrypto: solo el backend lo descifra
#                           y solo para el titular de la cuenta.
#
# Por que un scorecard y no un modelo de caja negra: cada factor se parte en
# tramos, cada tramo vale una cantidad fija de puntos, y el score es la suma.
# Eso permite decirle al cliente exactamente de donde sale cada punto y que
# tendria que cambiar para subir (requisito de transparencia del proyecto).
#
# Metodo: tramos (coarse classing) con cortes legibles -> se fusionan tramos
# hasta que la tasa de default sea monotona -> WoE por tramo -> regresion
# logistica sobre los WoE -> puntos = -factor * beta * WoE (escala PDO).
#
# Decisiones eticas (ver diccionario_datos.md, "discriminacion por proxy"):
#   - No se usan: genero, edad, estado civil, hijos, educacion, region, circulo
#     social, ni variables que son proxy fuerte de edad (EXT_SOURCE_1 rho=0.60,
#     antiguedad del documento, antiguedad del registro).
#   - Neutralidad ante ausencia de historial: si el cliente no tiene historial
#     en bureau (el "informal" del caso de negocio), esos factores valen 0
#     puntos. No suman ni restan: se le evalua con lo demas.
#   - Se entrena ademas un modelo "tradicional" (con esas variables y
#     penalizando la falta de historial) solo para medir el costo/beneficio
#     de estas decisiones: diferencia de AUC y de aprobacion sin historial.

import io
import json
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import psycopg2
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

from config import DB_CONFIG, ENCRYPTION_KEY

MODELO_VERSION = "scorecard-v1"

# Escala del score: 600 = riesgo promedio de la poblacion; cada 50 puntos
# (PDO, "points to double the odds") se duplica la razon buenos/malos.
SCORE_PROMEDIO = 600
PDO = 50
SCORE_MIN, SCORE_MAX = 300, 850

PILARES = [
    dict(id="capacidad", nombre="Capacidad de pago",
         descripcion="Si la cuota del crédito cabe en tu ingreso."),
    dict(id="estabilidad", nombre="Estabilidad",
         descripcion="Cuánto tiempo llevas con el mismo empleo y número de contacto."),
    dict(id="historial", nombre="Historial externo",
         descripcion="Tu comportamiento en otras entidades. Si no tienes historial, vale 0: no te penaliza."),
]

# riesgo="sube": a mayor valor, mas riesgo. riesgo="baja": a mayor valor, menos.
# cortes: bordes de los tramos, intervalos [a, b). neutral_si_nulo: el tramo
# "sin dato" vale 0 puntos por politica (ausencia de historial no penaliza).
# min_pct: tamanio minimo de un tramo (por defecto 2% de la poblacion); los
# binarios lo bajan para no perder un tramo chico pero muy informativo.
FACTORES = [
    dict(id="carga_cuota", nombre="Cuota vs. ingreso", pilar="capacidad",
         formato="pct", cortes=[0.10, 0.15, 0.20, 0.25], riesgo="sube",
         accionable=True, horizonte="inmediato",
         descripcion="Qué parte de tu ingreso se iría en la cuota de este crédito."),
    dict(id="credito_bien", nombre="Monto financiado vs. precio del bien", pilar="capacidad",
         formato="ratio", cortes=[1.0, 1.1, 1.2, 1.3], riesgo="sube",
         accionable=True, horizonte="inmediato",
         descripcion="Si pides más dinero que el precio de lo que compras (seguros, comisiones, extras)."),
    dict(id="anios_empleo", nombre="Antigüedad en tu empleo", pilar="estabilidad",
         formato="anios", cortes=[1, 3, 5, 10], riesgo="baja",
         etiqueta_nulo="Sin empleo actual (pensión u otro ingreso)",
         accionable=True, horizonte="largo",
         descripcion="Años que llevas en tu empleo actual."),
    dict(id="anios_telefono", nombre="Antigüedad de tu número de contacto", pilar="estabilidad",
         formato="anios", cortes=[1, 2, 3, 5], riesgo="baja",
         accionable=True, horizonte="largo",
         descripcion="Hace cuánto usas el mismo número de teléfono."),
    dict(id="score_externo", nombre="Score de fuentes externas", pilar="historial",
         formato="score01", cortes=[0.3, 0.4, 0.5, 0.6, 0.7], riesgo="baja",
         neutral_si_nulo=True, etiqueta_nulo="Sin score externo",
         accionable=False, horizonte="largo",
         descripcion="Promedio de los puntajes externos disponibles (0 = riesgoso, 1 = confiable)."),
    dict(id="antiguedad_historial", nombre="Antigüedad de tu historial", pilar="historial",
         formato="anios", cortes=[1, 2, 4, 6], riesgo="baja",
         neutral_si_nulo=True, etiqueta_nulo="Sin historial en bureau",
         accionable=True, horizonte="largo",
         descripcion="Años desde tu primer crédito reportado en otra entidad."),
    dict(id="uso_deuda", nombre="Uso de tus créditos activos", pilar="historial",
         formato="pct", cortes=[0.01, 0.3, 0.6, 0.8, 0.95], riesgo="sube",
         neutral_si_nulo=True, etiqueta_nulo="Sin historial en bureau",
         accionable=True, horizonte="medio",
         descripcion="Deuda pendiente sobre el monto total de tus créditos activos en otras entidades."),
    dict(id="creditos_activos", nombre="Créditos activos en otras entidades", pilar="historial",
         formato="entero", cortes=[2, 3, 4], riesgo="sube",
         neutral_si_nulo=True, etiqueta_nulo="Sin historial en bureau",
         accionable=True, horizonte="medio",
         descripcion="Cuántos créditos tienes abiertos hoy fuera de CrediFácil."),
    dict(id="atraso_actual", nombre="Atraso vigente en otra entidad", pilar="historial",
         formato="binario", cortes=[1], riesgo="sube", min_pct=0.005,
         neutral_si_nulo=True, etiqueta_nulo="Sin historial en bureau",
         accionable=True, horizonte="inmediato",
         descripcion="Si hoy tienes algún crédito externo con días de atraso o monto vencido."),
]

# Variables que el scorecard NO usa, con el motivo. Se muestran en la web.
EXCLUIDAS = [
    dict(variable="CODE_GENDER", nombre="Género", motivo="Atributo protegido: usarlo sería discriminación directa."),
    dict(variable="DAYS_BIRTH", nombre="Edad", motivo="Atributo protegido. Es predictiva, pero no es algo que puedas cambiar."),
    dict(variable="NAME_FAMILY_STATUS / CNT_CHILDREN", nombre="Estado civil e hijos", motivo="Vida privada, sin relación causal con tu voluntad de pago."),
    dict(variable="NAME_EDUCATION_TYPE", nombre="Nivel educativo", motivo="Proxy de nivel socioeconómico: reproduce desigualdad de origen."),
    dict(variable="REGION_RATING_*", nombre="Zona donde vives", motivo="Penalizar por barrio es 'redlining' (discriminación geográfica)."),
    dict(variable="OBS/DEF_*_SOCIAL_CIRCLE", nombre="Círculo social", motivo="Te juzgaría por las deudas de tus contactos, no por las tuyas."),
    dict(variable="EXT_SOURCE_1", nombre="Score externo 1", motivo="Correlación 0.60 con la edad: sería usar la edad por la puerta trasera."),
    dict(variable="DAYS_ID_PUBLISH / DAYS_REGISTRATION", nombre="Antigüedad del documento y del registro", motivo="Proxies de edad y no son accionables."),
    dict(variable="AMT_REQ_CREDIT_BUREAU_*", nombre="Consultas al bureau", motivo="Se evaluó, pero aportaba menos de 1 punto: se quitó para que el score sea más simple."),
    dict(variable="Plazo implicito (AMT_CREDIT / AMT_ANNUITY)", nombre="Plazo del crédito", motivo="Relación no monótona con el riesgo: no se puede explicar de forma honesta."),
]

APP_SQL = """
SELECT "SK_ID_CURR" AS sk_id_curr, "TARGET" AS target,
       "AMT_INCOME_TOTAL" AS ingreso, "AMT_CREDIT" AS monto_credito,
       "AMT_ANNUITY" AS anualidad, "AMT_GOODS_PRICE" AS precio_bien,
       "NAME_CONTRACT_TYPE" AS tipo_contrato,
       "DAYS_EMPLOYED" AS days_employed, "DAYS_LAST_PHONE_CHANGE" AS days_phone,
       "EXT_SOURCE_1" AS ext1, "EXT_SOURCE_2" AS ext2, "EXT_SOURCE_3" AS ext3,
       "AMT_REQ_CREDIT_BUREAU_YEAR" AS consultas_anio,
       "TIENE_HISTORIAL_BUREAU" AS tiene_historial,
       -- solo para el modelo "tradicional" de comparacion, no para el scorecard
       "DAYS_BIRTH" AS days_birth, "CODE_GENDER" AS genero,
       "NAME_EDUCATION_TYPE" AS educacion, "NAME_INCOME_TYPE" AS tipo_ingreso,
       "NAME_FAMILY_STATUS" AS estado_civil,
       "REGION_RATING_CLIENT_W_CITY" AS region_rating,
       "DAYS_ID_PUBLISH" AS days_id, "DAYS_REGISTRATION" AS days_reg,
       "DEF_30_CNT_SOCIAL_CIRCLE" AS def30
FROM raw.application_train_clean
"""

BUREAU_SQL = """
SELECT "SK_ID_CURR" AS sk_id_curr,
       -MIN("DAYS_CREDIT") / 365.0 AS antiguedad_historial,
       COUNT(*) FILTER (WHERE "CREDIT_ACTIVE" = 'Active') AS creditos_activos,
       (COALESCE(MAX("CREDIT_DAY_OVERDUE"), 0) > 0
        OR COALESCE(SUM("AMT_CREDIT_SUM_OVERDUE"), 0) > 0)::int AS atraso_actual,
       SUM(GREATEST("AMT_CREDIT_SUM_DEBT", 0)) FILTER (WHERE "CREDIT_ACTIVE" = 'Active') AS deuda_activa,
       SUM("AMT_CREDIT_SUM") FILTER (WHERE "CREDIT_ACTIVE" = 'Active') AS monto_activo
FROM raw.bureau_clean
GROUP BY "SK_ID_CURR"
"""


# --------------------------------------------------------------------------
# Features
# --------------------------------------------------------------------------

def build_features(app: pd.DataFrame, bur: pd.DataFrame) -> pd.DataFrame:
    df = app.merge(bur, on="sk_id_curr", how="left")
    hist = df["tiene_historial"] == 1
    f = pd.DataFrame({"sk_id_curr": df["sk_id_curr"], "target": df["target"]})
    f["carga_cuota"] = df["anualidad"] / df["ingreso"]
    f["credito_bien"] = df["monto_credito"] / df["precio_bien"]
    f["anios_empleo"] = -df["days_employed"] / 365  # NaN = sin empleo actual
    f["anios_telefono"] = (-df["days_phone"] / 365).clip(lower=0)
    f["score_externo"] = df[["ext2", "ext3"]].mean(axis=1)
    f["antiguedad_historial"] = df["antiguedad_historial"].where(hist)
    uso = (df["deuda_activa"] / df["monto_activo"].replace(0, np.nan)).clip(0, 1.5)
    # con historial pero sin creditos activos = no usa deuda (0), no "sin dato"
    f["uso_deuda"] = uso.fillna(0).where(hist)
    f["creditos_activos"] = df["creditos_activos"].where(hist)
    f["atraso_actual"] = df["atraso_actual"].where(hist)
    f["tiene_historial"] = hist.astype(int)
    # variables extra (sensibles) solo para el modelo de comparacion
    f["x_edad"] = -df["days_birth"] / 365
    f["x_genero"] = df["genero"]
    f["x_educacion"] = df["educacion"]
    f["x_tipo_ingreso"] = df["tipo_ingreso"]
    f["x_estado_civil"] = df["estado_civil"]
    f["x_region"] = df["region_rating"]
    f["x_ext1"] = df["ext1"]
    f["x_anios_doc"] = -df["days_id"] / 365
    f["x_anios_reg"] = -df["days_reg"] / 365
    f["x_def30"] = df["def30"]
    f["x_consultas"] = df["consultas_anio"]
    # valores crudos que la web necesita para calcular sugerencias concretas
    extra = df[["ingreso", "monto_credito", "anualidad", "precio_bien", "tipo_contrato",
                "deuda_activa", "monto_activo"]]
    return pd.concat([f, extra], axis=1)


# --------------------------------------------------------------------------
# Tramos + WoE
# --------------------------------------------------------------------------

def _bin_index(x: np.ndarray, cortes: list) -> np.ndarray:
    # tramo i = [cortes[i-1], cortes[i]); -1 = sin dato
    idx = np.searchsorted(np.asarray(cortes, dtype=float), x, side="right")
    return np.where(np.isnan(x), -1, idx)


def _woe(bad: np.ndarray, good: np.ndarray, tot_bad: float, tot_good: float) -> np.ndarray:
    # +0.5 evita log(0) en tramos chicos
    return np.log(((good + 0.5) / tot_good) / ((bad + 0.5) / tot_bad))


def fit_factor(x: pd.Series, y: pd.Series, spec: dict) -> dict:
    """Fusiona tramos contiguos hasta que la tasa de default sea monotona en
    la direccion declarada y cada tramo tenga al menos 2% de la poblacion."""
    xv = x.to_numpy(dtype=float)
    yv = y.to_numpy()
    tot_bad, tot_good = yv.sum(), (1 - yv).sum()
    cortes = list(spec["cortes"])
    min_n = spec.get("min_pct", 0.02) * len(xv)
    signo = 1 if spec["riesgo"] == "sube" else -1

    while True:
        idx = _bin_index(xv, cortes)
        n_bins = len(cortes) + 1
        n = np.array([(idx == i).sum() for i in range(n_bins)])
        bad = np.array([yv[idx == i].sum() for i in range(n_bins)])
        rate = bad / np.maximum(n, 1)
        merge_at = None
        for i in range(n_bins - 1):
            if n[i] < min_n or n[i + 1] < min_n or signo * (rate[i + 1] - rate[i]) < 0:
                merge_at = i
                break
        if merge_at is None or not cortes:
            break
        del cortes[merge_at]  # quita el borde entre el tramo i y el i+1

    good = n - bad
    woe = _woe(bad, good, tot_bad, tot_good)
    tramos = []
    for i in range(len(cortes) + 1):
        lo = cortes[i - 1] if i > 0 else None
        hi = cortes[i] if i < len(cortes) else None
        tramos.append(dict(desde=lo, hasta=hi, etiqueta=_etiqueta(lo, hi, spec["formato"]),
                           n=int(n[i]), tasa_default=float(rate[i]), woe=float(woe[i])))

    nulo = None
    mask_na = np.isnan(xv)
    if mask_na.any():
        n_na, bad_na = int(mask_na.sum()), int(yv[mask_na].sum())
        woe_na = 0.0 if spec.get("neutral_si_nulo") else float(_woe(bad_na, n_na - bad_na, tot_bad, tot_good))
        nulo = dict(etiqueta=spec.get("etiqueta_nulo", "Sin dato"), n=n_na,
                    tasa_default=bad_na / n_na, woe=woe_na,
                    neutral=bool(spec.get("neutral_si_nulo")))
    return dict(cortes=cortes, tramos=tramos, nulo=nulo)


def _fmt(v, formato):
    if formato == "pct":
        return f"{v * 100:.0f}%"
    if formato == "anios":
        return f"{v:g} {'año' if v == 1 else 'años'}"
    if formato == "ratio":
        return f"{v:.1f}x"
    if formato == "score01":
        return f"{v:.1f}"
    return f"{v:g}"


def _etiqueta(lo, hi, formato):
    if formato == "binario":
        return "No" if hi is not None else "Sí"
    if formato == "entero":
        if lo is None:
            return f"0 a {hi - 1:g}" if hi > 1 else "0"
        if hi is None:
            return f"{lo:g} o más"
        return f"{lo:g}" if hi - lo == 1 else f"{lo:g} a {hi - 1:g}"
    if lo is None:
        return f"Menos de {_fmt(hi, formato)}"
    if hi is None:
        return f"{_fmt(lo, formato)} o más"
    return f"{_fmt(lo, formato)} a {_fmt(hi, formato)}"


def woe_matrix(f: pd.DataFrame, modelos: dict) -> np.ndarray:
    cols = []
    for fid, m in modelos.items():
        xv = f[fid].to_numpy(dtype=float)
        idx = _bin_index(xv, m["cortes"])
        w = np.array([t["woe"] for t in m["tramos"]])
        col = np.where(idx >= 0, w[np.clip(idx, 0, len(w) - 1)], m["nulo"]["woe"] if m["nulo"] else 0.0)
        cols.append(col)
    return np.column_stack(cols)


# --------------------------------------------------------------------------
# Modelo de comparacion ("tradicional"): mismas tecnicas, sin restricciones
# eticas. Solo se usa para reportar el costo/beneficio de esas restricciones.
# --------------------------------------------------------------------------

def _woe_por_grupo(grupo: pd.Series, y: pd.Series, en_train: np.ndarray) -> np.ndarray:
    # WoE calculado solo con train y aplicado a todos (sin fuga hacia test)
    ytr = y[en_train]
    g = pd.DataFrame({"g": grupo[en_train], "y": ytr}).groupby("g")["y"].agg(["sum", "size"])
    w = _woe(g["sum"].to_numpy(), (g["size"] - g["sum"]).to_numpy(), ytr.sum(), (1 - ytr).sum())
    return grupo.map(dict(zip(g.index, w))).fillna(0.0).to_numpy()


def matriz_tradicional(f: pd.DataFrame, en_train: np.ndarray) -> np.ndarray:
    num = ["carga_cuota", "credito_bien", "anios_empleo", "anios_telefono", "antiguedad_historial",
           "uso_deuda", "creditos_activos", "x_consultas", "x_edad", "x_anios_doc", "x_anios_reg", "x_def30"]
    y = f["target"]
    cols = []
    for x in [f[c] for c in num] + [f[["x_ext1", "score_externo"]].mean(axis=1)]:
        # deciles de train; sin dato = su propio grupo (penaliza la ausencia)
        bordes = np.unique(np.nanquantile(x[en_train], np.linspace(0, 1, 11)[1:-1]))
        grupo = pd.Series(np.searchsorted(bordes, x, side="right"), index=f.index).where(x.notna(), -1)
        cols.append(_woe_por_grupo(grupo, y, en_train))
    for c in ["atraso_actual", "x_genero", "x_educacion", "x_tipo_ingreso", "x_estado_civil", "x_region", "tiene_historial"]:
        cols.append(_woe_por_grupo(f[c].astype(str), y, en_train))
    return np.column_stack(cols).astype(float)


# --------------------------------------------------------------------------
# Entrenamiento
# --------------------------------------------------------------------------

def entrenar(f: pd.DataFrame) -> tuple[dict, pd.DataFrame]:
    idx_train, idx_test = train_test_split(f.index, test_size=0.2, random_state=42, stratify=f["target"])
    ftr = f.loc[idx_train]

    specs = {s["id"]: s for s in FACTORES}
    activos = list(specs)
    while True:
        modelos = {fid: fit_factor(ftr[fid], ftr["target"], specs[fid]) for fid in activos}
        X = woe_matrix(f, modelos)
        lr = LogisticRegression(C=1e6, max_iter=2000)
        lr.fit(X[f.index.get_indexer(idx_train)], ftr["target"])
        # con WoE = ln(buenos/malos), todo beta valido es negativo. Un beta >= 0
        # indica colinealidad y daria puntos al reves de lo explicado: se quita.
        malos = [fid for fid, b in zip(activos, lr.coef_[0]) if b >= 0]
        if not malos:
            break
        print(f"  factor descartado por signo invertido: {malos}")
        activos = [a for a in activos if a not in malos]

    B = PDO / np.log(2)
    odds_pob = (1 - f["target"].mean()) / f["target"].mean()
    A = SCORE_PROMEDIO - B * np.log(odds_pob)
    base = int(round(A - B * lr.intercept_[0]))

    factores_out = []
    puntos_cols = {}
    for j, fid in enumerate(activos):
        beta = float(lr.coef_[0][j])
        m = modelos[fid]
        for t in m["tramos"]:
            t["puntos"] = int(round(-B * beta * t["woe"]))
        if m["nulo"]:
            m["nulo"]["puntos"] = int(round(-B * beta * m["nulo"]["woe"]))
        xv = f[fid].to_numpy(dtype=float)
        idx = _bin_index(xv, m["cortes"])
        pts = np.array([t["puntos"] for t in m["tramos"]])
        pts_na = m["nulo"]["puntos"] if m["nulo"] else 0
        puntos_cols[fid] = np.where(idx >= 0, pts[np.clip(idx, 0, len(pts) - 1)], pts_na)
        s = specs[fid]
        factores_out.append(dict(
            id=fid, nombre=s["nombre"], pilar=s["pilar"], formato=s["formato"],
            riesgo=s["riesgo"], descripcion=s["descripcion"], accionable=s["accionable"],
            horizonte=s["horizonte"], beta=beta, cortes=m["cortes"], tramos=m["tramos"], nulo=m["nulo"],
            rango_puntos=[int(min(pts.min(), pts_na)), int(max(pts.max(), pts_na))],
        ))

    puntos = pd.DataFrame(puntos_cols, index=f.index)
    score = (base + puntos.sum(axis=1)).clip(SCORE_MIN, SCORE_MAX).astype(int)

    # --- metricas (sobre test, que no se uso para definir tramos ni betas) ---
    te = f.index.get_indexer(idx_test)
    y_te = f["target"].to_numpy()[te]
    auc = roc_auc_score(y_te, -score.to_numpy()[te])

    en_train = f.index.isin(idx_train)
    Xt = matriz_tradicional(f, en_train)
    lr_t = LogisticRegression(C=1e6, max_iter=2000).fit(Xt[en_train], f["target"][en_train])
    p_trad = lr_t.predict_proba(Xt)[:, 1]
    auc_trad = roc_auc_score(y_te, p_trad[te])

    umbral = elegir_umbral(score, f["target"])
    apto = score >= umbral
    # el tradicional se evalua con el mismo % de aprobacion global, para que
    # la comparacion de inclusion sea justa (misma "generosidad" total)
    corte_trad = np.quantile(p_trad, apto.mean())
    apto_trad = p_trad <= corte_trad
    sin_hist = f["tiene_historial"] == 0

    def _tasas(mask_apto):
        return dict(
            aprobacion=float(mask_apto.mean()),
            aprobacion_sin_historial=float(mask_apto[sin_hist].mean()),
            aprobacion_con_historial=float(mask_apto[~sin_hist].mean()),
            default_aprobados=float(f["target"][mask_apto].mean()),
            default_aprobados_sin_historial=float(f["target"][mask_apto & sin_hist].mean()),
        )

    bandas = [
        dict(id="alto", nombre="Riesgo alto", desde=SCORE_MIN, hasta=umbral - 80),
        dict(id="construccion", nombre="En construcción", desde=umbral - 80, hasta=umbral),
        dict(id="apto", nombre="Apto", desde=umbral, hasta=umbral + 60),
        dict(id="bueno", nombre="Bueno", desde=umbral + 60, hasta=umbral + 120),
        dict(id="excelente", nombre="Excelente", desde=umbral + 120, hasta=SCORE_MAX + 1),
    ]

    # distribucion por cubetas de 10 puntos: alimenta el histograma de la web
    # y el "de cada 100 personas con tu score, X se atrasaron"
    cub = (score // 10) * 10
    dist = (pd.DataFrame({"c": cub, "y": f["target"], "h": f["tiene_historial"]})
            .groupby("c").agg(n=("y", "size"), malos=("y", "sum"), con_historial=("h", "sum")).reset_index())
    distribucion = [dict(desde=int(r.c), n=int(r.n), tasa_default=float(r.malos / r.n),
                         n_con_historial=int(r.con_historial)) for r in dist.itertuples()]

    # medianas de puntos por pilar para comparar sin exponer a nadie
    pil = pd.DataFrame({p["id"]: puntos[[x["id"] for x in factores_out if x["pilar"] == p["id"]]].sum(axis=1)
                        for p in PILARES})
    grupos = {"todos": slice(None), "aptos": apto, "sin_historial": sin_hist, "con_historial": ~sin_hist}
    ref_pilares = {g: {p: float(pil.loc[m, p].median()) for p in pil.columns} for g, m in grupos.items()}
    ref_factores = {g: {c: float(puntos.loc[m, c].mean()) for c in puntos.columns} for g, m in grupos.items()}

    modelo = dict(
        version=MODELO_VERSION,
        entrenado_en=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        n_entrenamiento=int(len(idx_train)), n_total=int(len(f)),
        escala=dict(promedio=SCORE_PROMEDIO, pdo=PDO, min=SCORE_MIN, max=SCORE_MAX, A=float(A), B=float(B)),
        base=base, umbral_apto=int(umbral), bandas=bandas,
        pilares=PILARES, factores=factores_out, excluidas=EXCLUIDAS,
        metricas=dict(auc=float(auc), gini=float(2 * auc - 1), tasa_default_poblacion=float(f["target"].mean())),
        comparacion=dict(
            auc_tradicional=float(auc_trad), auc_scorecard=float(auc),
            costo_auc=float(auc_trad - auc),
            scorecard=_tasas(apto), tradicional=_tasas(pd.Series(apto_trad, index=f.index)),
        ),
        distribucion=distribucion,
        referencia_pilares=ref_pilares,
        referencia_factores=ref_factores,
    )

    res = pd.DataFrame({"sk_id_curr": f["sk_id_curr"], "score": score, "apto": apto,
                        "tiene_historial": f["tiene_historial"] == 1})
    res["banda"] = [next(b["id"] for b in bandas if b["desde"] <= s < b["hasta"]) for s in score]
    for p in PILARES:
        res[f"pilar_{p['id']}"] = pil[p["id"]].astype(int)
    res["detalle"] = _detalles(f, puntos, activos)
    return modelo, res


def elegir_umbral(score: pd.Series, y: pd.Series, tasa_objetivo: float = 0.10) -> int:
    # umbral = primer score (multiplo de 10) desde el cual la tasa de default
    # observada de esa cubeta queda por debajo de tasa_objetivo
    cub = (score // 10) * 10
    tasa = y.groupby(cub).mean().sort_index()
    for c, t in tasa.items():
        if t <= tasa_objetivo and (tasa.loc[c:] <= tasa_objetivo * 1.15).all():
            return int(c)
    return int(tasa.index[-1])


def _detalles(f: pd.DataFrame, puntos: pd.DataFrame, activos: list) -> list[str]:
    extra = ["ingreso", "monto_credito", "anualidad", "precio_bien", "deuda_activa", "monto_activo"]
    vals = f[activos].to_numpy(dtype=float)
    ext = f[extra].to_numpy(dtype=float)
    pts = puntos[activos].to_numpy()
    tipos = f["tipo_contrato"].to_numpy()
    out = []
    for i in range(len(f)):
        v = {a: (None if np.isnan(vals[i, j]) else round(float(vals[i, j]), 4)) for j, a in enumerate(activos)}
        e = {k: (None if np.isnan(ext[i, j]) else round(float(ext[i, j]), 2)) for j, k in enumerate(extra)}
        e["tipo_contrato"] = tipos[i]
        out.append(json.dumps({"valores": v, "puntos": {a: int(pts[i, j]) for j, a in enumerate(activos)},
                               "solicitud": e}, separators=(",", ":")))
    return out


# --------------------------------------------------------------------------
# Persistencia
# --------------------------------------------------------------------------

DDL = """
CREATE SCHEMA IF NOT EXISTS core;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS core.modelo_scorecard (
    version TEXT PRIMARY KEY,
    definicion JSONB NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT false,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.scores (
    sk_id_curr BIGINT PRIMARY KEY REFERENCES core.solicitudes(sk_id_curr),
    modelo_version TEXT NOT NULL REFERENCES core.modelo_scorecard(version),
    score INT NOT NULL,
    banda TEXT NOT NULL,
    apto BOOLEAN NOT NULL,
    tiene_historial BOOLEAN NOT NULL,
    pilar_capacidad INT NOT NULL,
    pilar_estabilidad INT NOT NULL,
    pilar_historial INT NOT NULL,
    detalle_cifrado BYTEA NOT NULL,
    calculado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scores_score ON core.scores (score);
"""


def guardar(conn, modelo: dict, res: pd.DataFrame):
    cols = ["sk_id_curr", "score", "banda", "apto", "tiene_historial", "pilar_capacidad",
            "pilar_estabilidad", "pilar_historial", "detalle"]
    with conn.cursor() as cur:
        cur.execute(DDL)
        cur.execute("DELETE FROM core.scores WHERE modelo_version = %s", (modelo["version"],))
        cur.execute("UPDATE core.modelo_scorecard SET activo = false")
        cur.execute(
            """INSERT INTO core.modelo_scorecard (version, definicion, activo) VALUES (%s, %s, true)
               ON CONFLICT (version) DO UPDATE SET definicion = EXCLUDED.definicion, activo = true, creado_en = now()""",
            (modelo["version"], json.dumps(modelo)),
        )
        # el detalle en claro solo vive en esta tabla temporal (se borra al
        # hacer commit) y se cifra al pasar a core.scores. cipher-algo=aes256:
        # sin esa opcion pgcrypto usa AES-128 por defecto.
        cur.execute("""CREATE TEMP TABLE tmp_scores (
            sk_id_curr BIGINT, score INT, banda TEXT, apto BOOLEAN, tiene_historial BOOLEAN,
            pilar_capacidad INT, pilar_estabilidad INT, pilar_historial INT,
            detalle TEXT) ON COMMIT DROP""")
        buf = io.StringIO()
        res[cols].to_csv(buf, index=False, header=False)
        buf.seek(0)
        cur.copy_expert("COPY tmp_scores FROM STDIN WITH CSV", buf)
        cur.execute(
            """INSERT INTO core.scores (sk_id_curr, modelo_version, score, banda, apto, tiene_historial,
                   pilar_capacidad, pilar_estabilidad, pilar_historial, detalle_cifrado)
               SELECT t.sk_id_curr, %(v)s, t.score, t.banda, t.apto, t.tiene_historial,
                   t.pilar_capacidad, t.pilar_estabilidad, t.pilar_historial,
                   pgp_sym_encrypt(t.detalle, %(key)s, 'cipher-algo=aes256')
               FROM tmp_scores t
               JOIN core.solicitudes s ON s.sk_id_curr = t.sk_id_curr""",
            {"v": modelo["version"], "key": ENCRYPTION_KEY},
        )
    conn.commit()


def main():
    if not ENCRYPTION_KEY:
        raise SystemExit("Falta HC_ENCRYPTION_KEY (env var), se usa para pgcrypto")
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        with conn.cursor() as cur:
            cur.execute(APP_SQL)
            app = pd.DataFrame(cur.fetchall(), columns=[d[0] for d in cur.description])
            cur.execute(BUREAU_SQL)
            bur = pd.DataFrame(cur.fetchall(), columns=[d[0] for d in cur.description])
        num = app.columns.difference(["tipo_contrato", "genero", "educacion", "tipo_ingreso", "estado_civil"])
        app[num] = app[num].apply(pd.to_numeric)
        bur = bur.apply(pd.to_numeric)
        f = build_features(app, bur)
        modelo, res = entrenar(f)
        c = modelo["comparacion"]
        print(f"scorecard entrenado: AUC={modelo['metricas']['auc']:.3f} (tradicional {c['auc_tradicional']:.3f}), "
              f"umbral apto={modelo['umbral_apto']}, aprobacion sin historial "
              f"{c['scorecard']['aprobacion_sin_historial']:.1%} vs {c['tradicional']['aprobacion_sin_historial']:.1%}")
        guardar(conn, modelo, res)
        print(f"core.modelo_scorecard y core.scores poblados ({len(res):,} clientes)")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
