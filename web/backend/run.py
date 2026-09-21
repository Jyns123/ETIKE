# Arranca la app solo por HTTPS:  python run.py
# Requiere los certificados de scripts/gen_certs.py.

import ssl

import uvicorn

from app.config import settings

if __name__ == "__main__":
    if not settings.tls_cert.exists() or not settings.tls_key.exists():
        raise SystemExit("Faltan certificados TLS: correr  python scripts/gen_certs.py")
    print(f"CrediFácil en https://localhost:{settings.port}")
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        ssl_certfile=str(settings.tls_cert),
        ssl_keyfile=str(settings.tls_key),
        ssl_version=ssl.PROTOCOL_TLS_SERVER,
        ssl_ciphers="ECDHE+AESGCM:ECDHE+CHACHA20",
        server_header=False,
        proxy_headers=False,
    )
