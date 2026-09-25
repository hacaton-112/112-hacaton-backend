#!/bin/sh

set -eu

script_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
hostname="${1:-system112.local}"
output_directory="${2:-$script_directory/certs}"
valid_days="${TLS_CERTIFICATE_DAYS:-30}"

case "$hostname" in
  ''|.*|*[!A-Za-z0-9.-]*|*..*)
    echo "tls: hostname must contain only letters, digits, dots and hyphens" >&2
    exit 1
    ;;
esac

case "$valid_days" in
  ''|*[!0-9]*)
    echo "tls: TLS_CERTIFICATE_DAYS must be a positive integer" >&2
    exit 1
    ;;
esac
[ "$valid_days" -gt 0 ] || {
  echo "tls: TLS_CERTIFICATE_DAYS must be greater than zero" >&2
  exit 1
}

certificate="$output_directory/tls.crt"
private_key="$output_directory/tls.key"

if { [ -e "$certificate" ] || [ -e "$private_key" ]; } && \
  [ "${TLS_OVERWRITE:-false}" != "true" ]; then
  echo "tls: certificate already exists; set TLS_OVERWRITE=true to replace it" >&2
  exit 1
fi

mkdir -p "$output_directory"
umask 077

openssl req \
  -x509 \
  -newkey rsa:3072 \
  -sha256 \
  -nodes \
  -days "$valid_days" \
  -subj "/CN=$hostname" \
  -addext "subjectAltName=DNS:$hostname,DNS:localhost,IP:127.0.0.1" \
  -keyout "$private_key" \
  -out "$certificate"

chmod 0600 "$private_key"
chmod 0644 "$certificate"

echo "tls: created $certificate"
echo "tls: trust this development certificate explicitly; use the internal CA in production"
