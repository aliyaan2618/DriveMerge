@echo off
setlocal
rem DriveMerge command line: rclone using DriveMerge's accounts and pool, plus saved sync jobs.
set "RCLONE_CONFIG=%APPDATA%\com.drivemerge.app\rclone.conf"

if "%~1"=="" goto help
if /i "%~1"=="help" goto help
if /i "%~1"=="--help" goto help
if /i "%~1"=="run" goto jobs
if /i "%~1"=="jobs" goto jobs

"%~dp0rclone.exe" %*
exit /b %ERRORLEVEL%

:jobs
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0drivemerge-run.ps1" %*
exit /b %ERRORLEVEL%

:help
echo DriveMerge command line
echo.
echo   drivemerge jobs                       List saved sync jobs
echo   drivemerge run "Job name" [--dry-run]  Run a saved sync job
echo   drivemerge ^<rclone command^>           Any rclone command, using your DriveMerge accounts
echo.
echo Examples:
echo   drivemerge ls pool:Photos
echo   drivemerge copy C:\Backups pool:Backups -P
echo   drivemerge move "pool:Old stuff" pool:Archive
echo   drivemerge about pool:
echo   drivemerge listremotes
echo.
echo Wildcards: drivemerge copy C:\Docs pool:Docs --include "*.pdf"
echo Full reference: https://rclone.org/commands/
exit /b 0
