@echo off
cd /d "%~dp0"
docker compose --env-file server/.env -p server -f server/docker-compose.yml up -d --build
if errorlevel 1 exit /b 1
echo ParkFlow API: http://localhost:4000
