#!/usr/bin/env bash
# WS-026 isolated unit suite. Run from repository root or api directory.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."
node --import tsx --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/ws026/*.test.ts
