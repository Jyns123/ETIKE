# Pruebas puras de la logica que explica el score (app/scoring.py): no tocan
# la BD, usan un modelo sintetico chico. El scorecard real completo (con el
# modelo entrenado) se prueba en pipeline/tests/test_score_model.py.

from app import scoring

MODELO = {
    "umbral_apto": 580,
    "bandas": [
        {"id": "alto", "nombre": "Riesgo alto", "desde": 300, "hasta": 580},
        {"id": "apto", "nombre": "Apto", "desde": 580, "hasta": 851},
    ],
    "factores": [
        {
            "id": "ingreso",
            "cortes": [0.2, 0.4],
            "tramos": [
                {"etiqueta": "bajo", "puntos": -10},
                {"etiqueta": "medio", "puntos": 5},
                {"etiqueta": "alto", "puntos": 20},
            ],
            "nulo": None,
        },
        {
            "id": "historial_bureau",
            "cortes": [0.5],
            "tramos": [{"etiqueta": "malo", "puntos": -15}, {"etiqueta": "bueno", "puntos": 15}],
            # neutral_si_nulo: cliente sin historial no debe sumar ni restar
            "nulo": {"etiqueta": "sin historial", "puntos": 0, "neutral": True},
        },
    ],
}
MODELO["_factores"] = {f["id"]: f for f in MODELO["factores"]}


def test_tramo_de_ubica_el_intervalo_correcto():
    f = MODELO["factores"][0]
    assert scoring.tramo_de(f, 0.1) == 0
    assert scoring.tramo_de(f, 0.3) == 1
    assert scoring.tramo_de(f, 0.9) == 2


def test_tramo_de_sin_dato_es_menos_uno():
    f = MODELO["factores"][0]
    assert scoring.tramo_de(f, None) == -1


def test_puntos_de_devuelve_los_puntos_del_tramo():
    f = MODELO["factores"][0]
    assert scoring.puntos_de(f, 0.1) == -10
    assert scoring.puntos_de(f, 0.9) == 20


def test_puntos_de_factor_neutral_sin_dato_es_cero():
    """La garantia etica central: sin historial en bureau, ese factor no
    penaliza ni beneficia."""
    f = MODELO["_factores"]["historial_bureau"]
    assert scoring.puntos_de(f, None) == 0


def test_banda_de_ubica_la_banda_por_score():
    assert scoring.banda_de(MODELO, 400)["id"] == "alto"
    assert scoring.banda_de(MODELO, 580)["id"] == "apto"
    assert scoring.banda_de(MODELO, 850)["id"] == "apto"


def test_explicar_arma_un_item_por_factor_con_sus_puntos_reales():
    det = {"valores": {"ingreso": 0.3, "historial_bureau": None}, "puntos": {"ingreso": 5, "historial_bureau": 0}}
    out = scoring.explicar(MODELO, det)
    por_id = {o["id"]: o for o in out}
    assert por_id["ingreso"]["tramo"] == 1
    assert por_id["ingreso"]["puntos"] == 5
    assert por_id["historial_bureau"]["tramo"] == -1
    assert por_id["historial_bureau"]["puntos"] == 0
