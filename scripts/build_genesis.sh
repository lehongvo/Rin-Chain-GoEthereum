#!/usr/bin/env bash
set -euo pipefail

# This script builds geth/genesis.json from geth/genesis.template.json
# Variables taken from environment or .env file at repo root.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  . "$ENV_FILE"
  set +a
fi

CHAIN_ID="${CHAIN_ID:-1337}"
SIGNER_ADDR="${CLIQUE_SIGNER_ADDRESS:-}"

if [ -z "$SIGNER_ADDR" ]; then
  echo "ERROR: CLIQUE_SIGNER_ADDRESS is not set. Put it in .env or export it." >&2
  exit 1
fi

# Normalize address formats
SIGNER_ADDR_NO_0X="${SIGNER_ADDR#0x}"
SIGNER_ADDR_LOWER="$(printf "%s" "$SIGNER_ADDR_NO_0X" | tr 'A-F' 'a-f')"

if [ "${#SIGNER_ADDR_LOWER}" -ne 40 ]; then
  echo "ERROR: CLIQUE_SIGNER_ADDRESS must be a 20-byte hex address (40 hex chars)." >&2
  exit 1
fi

# Build Clique extraData = 32-byte vanity (64 zeros) + signer(s) + 65-byte seal (130 zeros)
EXTRA_DATA="$(printf "%064d" 0)${SIGNER_ADDR_LOWER}$(printf "%0130d" 0)"

TEMPLATE="$ROOT_DIR/geth/genesis.template.json"
OUT="$ROOT_DIR/geth/genesis.json"

if [ ! -f "$TEMPLATE" ]; then
  echo "ERROR: Template not found: $TEMPLATE" >&2
  exit 1
fi

# Simple templating via sed (replace literal tokens in template)
sed \
  -e "s#\\\${CHAIN_ID}#$CHAIN_ID#g" \
  -e "s#\\\${EXTRA_DATA}#$EXTRA_DATA#g" \
  -e "s#\\\${SIGNER_ADDR_LOWER}#$SIGNER_ADDR_LOWER#g" \
  "$TEMPLATE" > "$OUT.tmp"

# The above sed may replace unintended occurrences if a numeric matches by accident.
# To be safe, we instead use placeholder tokens that are unlikely to collide.
# Rewrite with explicit tokens in template if needed.
if grep -q "\${" "$OUT.tmp"; then
  # If any placeholders remain, abort to avoid a broken genesis
  echo "ERROR: Some placeholders were not replaced. Check your .env and template." >&2
  rm -f "$OUT.tmp"
  exit 1
fi

mv "$OUT.tmp" "$OUT"
echo "Wrote $OUT"


