del /f /q adaf.starforge.geode
if exist out rmdir /s /q out
if not exist out mkdir out
if not exist out\resources mkdir out\resources

xcopy bin\resources out\resources /E /I /Y
copy README.md out\about.md
copy changelog.md out\
copy logo.png out\
copy mod.json out\
for /R build %%f in (*.dll) do copy "%%f" "out\"

cd out
7z a -tzip ../adaf.starforge.geode -mx9 *

pause>nul