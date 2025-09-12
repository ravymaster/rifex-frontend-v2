#!/usr/bin/env bash
set -euo pipefail
cp -n docs/dotenv.example .env.local || true
echo "Instalando dependencias..."
npm i
echo "Levantando dev..."
npm run dev
