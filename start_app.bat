@echo off
echo Starting Hostingertest Application...
call npm run build:css
npm run dev
pause
