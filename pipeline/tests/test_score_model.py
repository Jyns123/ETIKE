# Pruebas del scorecard transparente (paso 3, score_model.py) contra la BD ya
# entrenada. Verifican las dos garantias que el proyecto le promete al
# cliente: 1) el score es exactamente "base + suma de puntos por factor" (asi
# se puede explicar cada punto), y 2) neutralidad ante ausencia de historial
# (factores de bureau valen 0 si el cliente no tiene historial, no penalizan).

import json


def test_score_en_rango_300_850(conn, modelo):
    with conn.cursor() as cur:
        cur.execute("SELECT min(score) AS lo, max(score) AS hi FROM core.scores")
        r = cur.fetchone()
    assert modelo["escala"]["min"] <= r["lo"]
    assert r["hi"] <= modelo["escala"]["max"]


def test_neutralidad_ante_ausencia_de_historial(modelo):
    """Los factores marcados como 'neutral_si_nulo' (score externo, historial de
    bureau, creditos activos, atraso, antiguedad de historial) no deben restar
    ni sumar puntos cuando el cliente no tiene ese dato: es la decision etica
    central del proyecto (ver comentarios en score_model.py)."""
    neutrales = [f for f in modelo["factores"] if f["nulo"] and f["nulo"]["neutral"]]
    assert neutrales, "el modelo deberia tener al menos un factor neutral ante ausencia de dato"
    for f in neutrales:
        assert f["nulo"]["puntos"] == 0, f"{f['id']}: sin dato deberia valer 0 puntos, vale {f['nulo']['puntos']}"


def test_score_es_base_mas_suma_de_puntos(conn, modelo, encryption_key):
    """El scorecard es aditivo por diseno: score = base + sum(puntos por
    factor), sin aproximaciones. Se verifica descifrando el detalle real de
    una muestra de clientes."""
    with conn.cursor() as cur:
        # TABLESAMPLE en vez de ORDER BY random(): con 300k+ filas, ordenar
        # la tabla entera para elegir 25 es mucho mas lento que muestrear.
        cur.execute(
            "SELECT score, pgp_sym_decrypt(detalle_cifrado, %s) AS detalle "
            "FROM core.scores TABLESAMPLE BERNOULLI (1) LIMIT 25",
            (encryption_key,),
        )
        filas = cur.fetchall()
    assert filas
    for fila in filas:
        det = json.loads(fila["detalle"])
        calculado = modelo["base"] + sum(det["puntos"].values())
        assert calculado == fila["score"]


def test_bandas_cubren_todo_el_rango_sin_huecos(modelo):
    bandas = sorted(modelo["bandas"], key=lambda b: b["desde"])
    assert bandas[0]["desde"] == modelo["escala"]["min"]
    assert bandas[-1]["hasta"] == modelo["escala"]["max"] + 1
    for a, b in zip(bandas, bandas[1:]):
        assert a["hasta"] == b["desde"], f"hueco entre {a['id']} y {b['id']}"
