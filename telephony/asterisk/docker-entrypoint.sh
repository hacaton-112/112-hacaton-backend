#!/bin/sh
# Конфигурация собирается из шаблонов при каждом старте: Asterisk не читает
# переменные окружения в .conf, а пароли не должны лежать в репозитории.
set -eu

: "${ASTERISK_ARI_USER:=system112}"
: "${ASTERISK_ARI_APP:=crew-handoff}"
: "${ASTERISK_RTP_START:=10000}"
: "${ASTERISK_RTP_END:=10099}"
: "${ASTERISK_WORKSTATIONS:=201,202,203,204}"
: "${ASTERISK_WEBRTC_WORKSTATIONS:=}"

if [ -z "${ASTERISK_ARI_PASSWORD:-}" ] || [ -z "${ASTERISK_SIP_PASSWORD:-}" ]; then
  echo "ASTERISK_ARI_PASSWORD and ASTERISK_SIP_PASSWORD are required" >&2
  exit 1
fi

external=""
if [ -n "${ASTERISK_EXTERNAL_ADDRESS:-}" ]; then
  external="external_media_address = ${ASTERISK_EXTERNAL_ADDRESS}
external_signaling_address = ${ASTERISK_EXTERNAL_ADDRESS}"
fi

workstations=""
for web_extension in $(echo "$ASTERISK_WEBRTC_WORKSTATIONS" | tr ',' ' '); do
  found="false"
  for extension in $(echo "$ASTERISK_WORKSTATIONS" | tr ',' ' '); do
    if [ "$extension" = "$web_extension" ]; then
      found="true"
      break
    fi
  done
  if [ "$found" != "true" ]; then
    echo "WebRTC workstation $web_extension is absent from ASTERISK_WORKSTATIONS" >&2
    exit 1
  fi
done

for extension in $(echo "$ASTERISK_WORKSTATIONS" | tr ',' ' '); do
  endpoint_template="dds-endpoint"
  sip_password="$ASTERISK_SIP_PASSWORD"
  for web_extension in $(echo "$ASTERISK_WEBRTC_WORKSTATIONS" | tr ',' ' '); do
    if [ "$extension" = "$web_extension" ]; then
      endpoint_template="dds-webrtc-endpoint"
      # Must match deriveBrowserPhonePassword() in the backend. A leaked
      # workstation credential cannot be reused to impersonate another desk.
      sip_password=$(printf '%s' "$extension" | openssl dgst -sha256 -hmac "$ASTERISK_SIP_PASSWORD" | awk '{print $NF}')
      break
    fi
  done
  workstations="${workstations}
[${extension}](${endpoint_template})
auth = ${extension}
aors = ${extension}
callerid = \"DDS ${extension}\" <${extension}>

[${extension}](dds-auth)
username = ${extension}
password = ${sip_password}

[${extension}](dds-aor)
"
done

render() {
  awk -v ari_user="$ASTERISK_ARI_USER" \
      -v ari_password="$ASTERISK_ARI_PASSWORD" \
      -v ari_app="$ASTERISK_ARI_APP" \
      -v rtp_start="$ASTERISK_RTP_START" \
      -v rtp_end="$ASTERISK_RTP_END" \
      -v external="$external" \
      -v workstations="$workstations" '
    {
      gsub(/@ARI_USER@/, ari_user)
      gsub(/@ARI_PASSWORD@/, ari_password)
      gsub(/@ARI_APP@/, ari_app)
      gsub(/@RTP_START@/, rtp_start)
      gsub(/@RTP_END@/, rtp_end)
      if ($0 == "@EXTERNAL_ADDRESSES@") { print external; next }
      if ($0 == "@WORKSTATIONS@") { print workstations; next }
      print
    }' "$1" > "$2"
}

for template in /etc/asterisk-templates/*.conf; do
  render "$template" "/etc/asterisk/$(basename "$template")"
done

mkdir -p /var/lib/asterisk/sounds/crew
exec asterisk -f -vvv
