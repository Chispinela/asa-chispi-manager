@echo off
cd /d "%~dp0"
if exist "release\win-unpacked\ASA Chispi Manager.exe" (
 start "" "release\win-unpacked\ASA Chispi Manager.exe"
) else (
 call npm start
)
