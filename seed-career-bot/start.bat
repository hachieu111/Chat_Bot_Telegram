batch
@echo off
echo Starting SEED Career Bot...
echo.

if not exist "node_modules" (
   echo Installing dependencies...
   npm install
)

echo Starting bot...
node bot.js

pause
