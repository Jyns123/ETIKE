# App FastAPI: API + archivos estaticos del front (web/frontend/dist).
# Se sirve solo por HTTPS (ver run.py y scripts/gen_certs.py).

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import db, scoring
from .config import settings
from .routers import auth, cliente, interno


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_pool()
    scoring.modelo_activo()  # falla temprano si el pipeline no corrio
    yield
    db.close_pool()


docs = os.environ.get("DEV_DOCS") == "1"
app = FastAPI(title="CrediFácil", lifespan=lifespan,
              docs_url="/api/docs" if docs else None, redoc_url=None,
              openapi_url="/api/openapi.json" if docs else None)

CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; "
       "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")
CABECERAS = {
    "Strict-Transport-Security": "max-age=31536000",
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
}
METODOS_SEGUROS = {"GET", "HEAD", "OPTIONS"}


@app.middleware("http")
async def seguridad(request: Request, call_next):
    # Anti-CSRF: ademas de la cookie SameSite=Strict, toda peticion que cambia
    # estado debe venir de un origen propio (el navegador no deja falsificar Origin).
    if request.method not in METODOS_SEGUROS and request.url.path.startswith("/api/"):
        origen = request.headers.get("origin")
        if origen not in settings.allowed_origins:
            return JSONResponse({"detail": "Origen no permitido"}, status_code=403)
    response = await call_next(request)
    for k, v in CABECERAS.items():
        response.headers.setdefault(k, v)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(RequestValidationError)
async def validacion(_: Request, exc: RequestValidationError):
    # FastAPI devuelve por defecto el valor recibido en el error: se quita para
    # no reflejar contrasenias u otros datos en respuestas/logs.
    errores = [{"campo": ".".join(str(x) for x in e["loc"][1:]), "mensaje": e["msg"]} for e in exc.errors()]
    return JSONResponse({"detail": "Datos inválidos", "errores": errores}, status_code=422)


app.include_router(auth.router)
app.include_router(cliente.router)
app.include_router(interno.router)


@app.get("/api/salud")
def salud():
    return {"ok": True}


# --- front compilado (npm run build). En desarrollo se usa Vite (npm run dev) ---
if settings.frontend_dist.is_dir():
    app.mount("/assets", StaticFiles(directory=settings.frontend_dist / "assets"), name="assets")

    @app.get("/{ruta:path}", include_in_schema=False)
    def spa(ruta: str):
        if ruta.startswith("api/"):
            return JSONResponse({"detail": "No encontrado"}, status_code=404)
        archivo = (settings.frontend_dist / ruta).resolve()
        # solo archivos dentro de dist/ (evita path traversal)
        if ruta and archivo.is_file() and settings.frontend_dist in archivo.parents:
            return FileResponse(archivo)
        return FileResponse(settings.frontend_dist / "index.html")
