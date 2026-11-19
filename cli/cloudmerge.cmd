@echo off
setlocal
rem CloudMerge command line: rclone using CloudMerge's accounts and pool, plus saved sync jobs.
set "RCLONE_CONFIG=%APPDATA%\com.cloudmerge.app\rclone.conf"

if "%~1"=="" goto help
if /i "%~1"=="help" goto help
if /i "%~1"=="--help" goto help
if /i "%~1"=="run" goto jobs
if /i "%~1"=="jobs" goto jobs

"%~dp0rclone.exe" %*
exit /b %ERRORLEVEL%

:jobs
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cloudmerge-run.ps1" %*
exit /b %ERRORLEVEL%

:help
echo CloudMerge command line
echo.
echo   cloudmerge jobs                       List saved sync jobs
echo   cloudmerge run "Job name" [--dry-run]  Run a saved sync job
echo   cloudmerge ^<rclone command^>           Any rclone command, using your CloudMerge accounts
echo.
echo Examples:
echo   cloudmerge ls pool:Photos
echo   cloudmerge copy C:\Backups pool:Backups -P
echo   cloudmerge move "pool:Old stuff" pool:Archive
echo   cloudmerge about pool:
echo   cloudmerge listremotes
echo.
echo Wildcards: cloudmerge copy C:\Docs pool:Docs --include "*.pdf"
echo Full reference: https://rclone.org/commands/
exit /b 0
