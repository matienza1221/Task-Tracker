#!/usr/bin/env bash
# Generates a self-signed development certificate for HTTPS.
# Usage: ./scripts/generate-certs.sh [cert-dir] [--force]
#
# The certificate is valid for localhost / 127.0.0.1 / ::1 and is stored in
# certs/ (gitignored). No certificate material is ever committed.
set -euo pipefail

# Git Bash / MSYS2 rewrites arguments that look like POSIX paths (e.g. /CN=localhost).
# Exclude only the -subj value; file paths must keep their normal conversion.
export MSYS2_ARG_CONV_EXCL='/CN'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="${1:-$SCRIPT_DIR/../certs}"
FORCE="${2:-}"

mkdir -p "$CERT_DIR"

if [[ -f "$CERT_DIR/dev.crt" && -f "$CERT_DIR/dev.key" && "$FORCE" != "--force" ]]; then
  echo "Certificates already exist in $CERT_DIR (use --force to regenerate)."
  exit 0
fi

openssl_args=(
  req -x509 -newkey rsa:4096 -sha256 -days 825 -nodes
  -keyout "$CERT_DIR/dev.key"
  -out "$CERT_DIR/dev.crt"
  -subj "/CN=localhost/O=Project Tracker Development"
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1"
  -addext "keyUsage=digitalSignature,keyEncipherment"
  -addext "extendedKeyUsage=serverAuth"
)

if command -v openssl >/dev/null 2>&1; then
  openssl "${openssl_args[@]}"
else
  echo "openssl not found on the host; using a temporary Docker container instead."
  # Translate the host path to a path the container can mount.
  if command -v cygpath >/dev/null 2>&1; then
    MOUNT_DIR="$(cygpath -w "$CERT_DIR")"
  else
    MOUNT_DIR="$CERT_DIR"
  fi
  docker run --rm -v "$MOUNT_DIR:/certs" alpine/openssl "${openssl_args[@]//"$CERT_DIR"/\/certs}"
fi

chmod 600 "$CERT_DIR/dev.key" 2>/dev/null || true
chmod 644 "$CERT_DIR/dev.crt" 2>/dev/null || true

echo "Generated development certificate:"
echo "  cert: $CERT_DIR/dev.crt"
echo "  key:  $CERT_DIR/dev.key"
echo "Browsers will warn about the self-signed certificate — this is expected in development."
