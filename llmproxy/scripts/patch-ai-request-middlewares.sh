#!/usr/bin/env bash

set -euo pipefail

if ! command -v curl >/dev/null 2>&1; then
  echo "error: curl is required" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required" >&2
  exit 1
fi

LLMPROXY_BASE_URL="${LLMPROXY_BASE_URL:-https://llmproxy.frugalai.haupt.dev}"
ADMIN_MIDDLEWARES_URL="${LLMPROXY_BASE_URL%/}/api/llmproxy/admin/ai-request-middleware/middlewares"
MIDDLEWARE_URL_TEMPLATE="${MIDDLEWARE_URL_TEMPLATE:-https://srv1513085.hstgr.cloud/middlewares/%s/api/v1/classify}"
SMALL_MODEL="${SMALL_MODEL:-glm-4.7-flash:latest}"
LARGE_MODEL="${LARGE_MODEL:-nemotron-3-super:latest}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-./tmp/middleware-backups-${TIMESTAMP}}"

if [[ $# -gt 0 ]]; then
  MIDDLEWARE_IDS=("$@")
else
  MIDDLEWARE_IDS=(simple onnx svc llm vs)
fi

AUTH_HEADERS=()
if [[ -n "${AUTH_BEARER_TOKEN:-}" ]]; then
  AUTH_HEADERS+=(-H "authorization: Bearer ${AUTH_BEARER_TOKEN}")
fi

mkdir -p "${BACKUP_DIR}"

usage() {
  cat <<EOF
Usage: $(basename "$0") [middleware-id...]

Patches llmproxy AI request middlewares after fetching the current config for each one.

Environment overrides:
  LLMPROXY_BASE_URL      Base URL for llmproxy admin API
  MIDDLEWARE_URL_TEMPLATE printf-style URL template, e.g. https://srv1513085.hstgr.cloud/middlewares/%s/api/v1/classify
  SMALL_MODEL            Model name for models.small
  LARGE_MODEL            Model name for models.large
  BACKUP_DIR             Directory where pre-update JSON backups are written
  AUTH_BEARER_TOKEN      Optional bearer token for the admin API

Examples:
  $(basename "$0")
  $(basename "$0") simple onnx
  SMALL_MODEL=gpt-4.1-mini LARGE_MODEL=gpt-4.1 $(basename "$0")
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

request_json() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local response_file
  local status

  response_file="$(mktemp)"

  if [[ -n "${body}" ]]; then
    status="$(
      curl -sS \
        -X "${method}" \
        "${AUTH_HEADERS[@]}" \
        -H "accept: application/json" \
        -H "content-type: application/json" \
        -o "${response_file}" \
        -w "%{http_code}" \
        --data "${body}" \
        "${url}"
    )"
  else
    status="$(
      curl -sS \
        -X "${method}" \
        "${AUTH_HEADERS[@]}" \
        -H "accept: application/json" \
        -o "${response_file}" \
        -w "%{http_code}" \
        "${url}"
    )"
  fi

  if [[ ! "${status}" =~ ^2[0-9][0-9]$ ]]; then
    echo "error: ${method} ${url} returned HTTP ${status}" >&2
    cat "${response_file}" >&2
    rm -f "${response_file}"
    exit 1
  fi

  cat "${response_file}"
  rm -f "${response_file}"
}

fetch_existing_middleware() {
  local middleware_id="$1"

  request_json "GET" "${ADMIN_MIDDLEWARES_URL}" | jq --arg id "${middleware_id}" '
    if (.data | type) != "array" then
      error("admin response does not contain a data array")
    else
      first(.data[]? | select(.id == $id))
    end
  '
}

build_payload() {
  local middleware_id="$1"
  local middleware_url

  middleware_url="$(printf "${MIDDLEWARE_URL_TEMPLATE}" "${middleware_id}")"

  jq -n \
    --arg id "${middleware_id}" \
    --arg url "${middleware_url}" \
    --arg small "${SMALL_MODEL}" \
    --arg large "${LARGE_MODEL}" \
    '{
      id: $id,
      url: $url,
      models: {
        small: $small,
        large: $large
      }
    }'
}

for middleware_id in "${MIDDLEWARE_IDS[@]}"; do
  echo
  echo "==> ${middleware_id}"

  existing_json="$(fetch_existing_middleware "${middleware_id}")"
  printf '%s\n' "${existing_json}" > "${BACKUP_DIR}/${middleware_id}.before.json"
  echo "Saved current config to ${BACKUP_DIR}/${middleware_id}.before.json"
  echo "${existing_json}" | jq .

  payload="$(build_payload "${middleware_id}")"
  echo "Updating to:"
  echo "${payload}" | jq .

  response="$(
    request_json \
      "PUT" \
      "${ADMIN_MIDDLEWARES_URL}/$(printf '%s' "${middleware_id}" | jq -sRr @uri)" \
      "${payload}"
  )"

  echo "Response:"
  echo "${response}" | jq .
done

echo
echo "Finished. Backups are in ${BACKUP_DIR}"
