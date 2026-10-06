@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js לא נמצא. יש להתקין Node.js בגרסה 20 ומעלה ולהפעיל שוב.
  pause
  exit /b 1
)
node scripts\build.mjs
if errorlevel 1 (
  echo הבנייה נכשלה. העתיקו את הודעת השגיאה ושלחו אותה לתיקון.
  pause
  exit /b 1
)
echo.
echo מאגר הסטודנטים: http://localhost:8080/
echo העורך: http://localhost:8080/editor.html
echo להשבתת השרת לחצו Ctrl+C. השאירו את החלון פתוח בזמן העבודה.
echo.
node scripts\serve.mjs
if errorlevel 1 pause
