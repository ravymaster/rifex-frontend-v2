#!/usr/bin/env bash
set -euo pipefail
NAME="rifex-frontend-$(date +%Y%m%d-%H%M%S).zip"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
echo "Packing $NAME ..."
zip -r "/mnt/data/$NAME" . -x "node_modules/*" ".next/*" "*.git/*" "*.DS_Store"
echo "ZIP listo: /mnt/data/$NAME"
