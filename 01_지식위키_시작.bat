@echo off
@rem ========================================================
@rem Sub-Wiki Server Launcher
@rem ========================================================
setlocal
cd /d "%~dp0wiki_portal"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
python -X utf8 serve.py
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to start Sub-Wiki server.
    pause
)
