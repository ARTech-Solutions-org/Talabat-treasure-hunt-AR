@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo  Deploy Talabat Treasure Hunt AR to Vercel (production^)
echo  Requires: Node.js, npm, and npx vercel (login once: npx vercel login^)
echo.

echo ==^> Install dependencies
if exist package-lock.json (
  call npm ci
) else (
  call npm install
)
if errorlevel 1 goto :fail

echo.
echo ==^> Build
call npm run build
if errorlevel 1 goto :fail

echo.
echo ==^> Deploy to Vercel (production^)
call npx vercel deploy --prod --yes
if errorlevel 1 goto :fail

echo.
echo ==^> Done
goto :end

:fail
echo.
echo Deploy failed — see messages above.
pause
exit /b 1

:end
echo.
pause
exit /b 0
