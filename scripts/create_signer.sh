#!/usr/bin/env bash
set -euo pipefail

# Creates a signer account inside the geth data dir using dockerized geth.
# Writes the signer address to .env as CLIQUE_SIGNER_ADDRESS if not already set.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$ROOT_DIR/geth/data"
PASSWORD_FILE="$DATA_DIR/password.txt"
ENV_FILE="$ROOT_DIR/.env"

mkdir -p "$DATA_DIR/keystore"

if [ ! -f "$PASSWORD_FILE" ]; then
  echo "password" > "$PASSWORD_FILE"
  echo "Created default password at $PASSWORD_FILE"
fi

echo "Creating new account (geth)..."
CREATE_OUTPUT=$(docker run --rm -i \
  -v "$DATA_DIR:/data" \
  ethereum/client-go:stable \
  --datadir /data account new --password /data/password.txt || true)

# Extract the first 0x...40-hex address from output
ADDR=$(printf "%s" "$CREATE_OUTPUT" | grep -Eo '0x[0-9a-fA-F]{40}' | head -n1)

if [ -z "$ADDR" ]; then
  echo "ERROR: Could not parse new account address. Full output was:" >&2
  printf "%s\n" "$CREATE_OUTPUT" >&2
  exit 1
fi

echo "New signer: $ADDR"

# Write to .env if not present
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
CHAIN_ID=1337
CLIQUE_SIGNER_ADDRESS=$ADDR
GETH_VERBOSITY=3

# Blockscout defaults
PG_DB=blockscout
PG_USER=blockscout
PG_PASSWORD=password
SECRET_KEY_BASE=$(openssl rand -hex 32)
COIN=RIN
NETWORK_NAME=rinchain-dev
EOF
  echo ".env created at $ENV_FILE"
else
  if ! grep -q '^CLIQUE_SIGNER_ADDRESS=' "$ENV_FILE"; then
    echo "CLIQUE_SIGNER_ADDRESS=$ADDR" >> "$ENV_FILE"
    echo "Added CLIQUE_SIGNER_ADDRESS to .env"
  else
    sed -i.bak -E "s#^CLIQUE_SIGNER_ADDRESS=.*#CLIQUE_SIGNER_ADDRESS=$ADDR#" "$ENV_FILE"
    rm -f "$ENV_FILE.bak"
    echo "Updated CLIQUE_SIGNER_ADDRESS in .env"
  fi
fi

echo "Done. Remember to run scripts/build_genesis.sh next."


