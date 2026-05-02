@echo off
echo ARcos App ishga tushirilmoqda...
cd /d "%~dp0"

echo 1. Kutubxonalarni tekshirish va o'rnatish...
call npm install express socket.io cors bcrypt jsonwebtoken sqlite3 simple-peer

echo.
echo 2. Serverni ishga tushirish...
echo DIQQAT: Bu oynani yopmang!
node server.js

pause
