# Genera una CA propia ("CrediFacil Dev Root CA") y un certificado de servidor
# para localhost firmado por ella (requisito del proyecto: certificados
# autofirmados o con CA propia).
#
#   python scripts/gen_certs.py            -> web/certs/
#
# Para que el navegador confie sin advertencias, importar web/certs/ca.crt como
# raiz de confianza del usuario actual (no requiere admin en Windows):
#   certutil -user -addstore Root web\certs\ca.crt
# Las llaves privadas (*.key) nunca se suben a git (ver .gitignore).

import ipaddress
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

OUT = Path(__file__).resolve().parents[2] / "certs"


def _guardar_llave(llave, ruta: Path):
    ruta.write_bytes(llave.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                         serialization.NoEncryption()))


def main():
    OUT.mkdir(exist_ok=True)
    ahora = datetime.now(timezone.utc)

    ca_key = ec.generate_private_key(ec.SECP256R1())
    ca_nombre = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "PE"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "CrediFacil (proyecto DS3031)"),
        x509.NameAttribute(NameOID.COMMON_NAME, "CrediFacil Dev Root CA"),
    ])
    ca_cert = (
        x509.CertificateBuilder()
        .subject_name(ca_nombre).issuer_name(ca_nombre)
        .public_key(ca_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(ahora - timedelta(minutes=5))
        .not_valid_after(ahora + timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
        .add_extension(x509.KeyUsage(digital_signature=False, content_commitment=False, key_encipherment=False,
                                     data_encipherment=False, key_agreement=False, key_cert_sign=True,
                                     crl_sign=True, encipher_only=False, decipher_only=False), critical=True)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()), critical=False)
        .sign(ca_key, hashes.SHA256())
    )

    srv_key = ec.generate_private_key(ec.SECP256R1())
    srv_cert = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")]))
        .issuer_name(ca_nombre)
        .public_key(srv_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(ahora - timedelta(minutes=5))
        .not_valid_after(ahora + timedelta(days=397))  # maximo que aceptan los navegadores
        .add_extension(x509.SubjectAlternativeName([
            x509.DNSName("localhost"),
            x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
            x509.IPAddress(ipaddress.ip_address("::1")),
        ]), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False, key_encipherment=False,
                                     data_encipherment=False, key_agreement=False, key_cert_sign=False,
                                     crl_sign=False, encipher_only=False, decipher_only=False), critical=True)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
        .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
        .sign(ca_key, hashes.SHA256())
    )

    (OUT / "ca.crt").write_bytes(ca_cert.public_bytes(serialization.Encoding.PEM))
    _guardar_llave(ca_key, OUT / "ca.key")
    (OUT / "server.crt").write_bytes(srv_cert.public_bytes(serialization.Encoding.PEM))
    _guardar_llave(srv_key, OUT / "server.key")
    print(f"Certificados en {OUT}")
    print("Para confiar en la CA (usuario actual, sin admin):  certutil -user -addstore Root web\\certs\\ca.crt")


if __name__ == "__main__":
    main()
