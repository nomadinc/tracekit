#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${COMMAS_WEBHOOK_SECRET:-}" ]]; then
  echo "COMMAS_WEBHOOK_SECRET is not set" >&2
  exit 1
fi

printf '%s' "$COMMAS_WEBHOOK_SECRET" | shasum -a 256 | cut -c1-8
