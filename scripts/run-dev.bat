@echo off
IF NOT EXIST ".env.local" (
  copy docs\dotenv.example .env.local
)
echo Instalando dependencias...
npm i
echo Iniciando dev...
npm run dev
