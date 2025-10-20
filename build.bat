setlocal
set OLDDIR=%cd%

cd frontend
call build.bat
cd /d "%OLDDIR%"

cd backend
call build.bat
cd /d "%OLDDIR%"

cd backend
call pack.bat
cd /d "%OLDDIR%"

endlocal

echo build done
pause>nul
