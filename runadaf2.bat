setlocal
set OLDDIR=%cd%

cd backend
call build.bat
cd /d "%OLDDIR%"

cd backend
call pack.bat
cd /d "%OLDDIR%"

endlocal

copy backend\adaf.starforge.geode "C:\Program Files (x86)\Steam\steamapps\common\Geometry Dash\geode\mods"
"C:\Program Files (x86)\Steam\steamapps\common\Geometry Dash\GeometryDash.exe"


echo build done
pause>nul