@echo off
REM Upstox ORB Trading Bot - Quick Setup Script
REM This script helps you get started quickly

echo.
echo ============================================================
echo UPSTOX ORB TRADING BOT - QUICK SETUP
echo ============================================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please download and install Node.js 18+ from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [1/5] Node.js is installed
node --version
echo.

REM Check if dependencies are installed
if not exist "node_modules\" (
    echo [2/5] Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
    echo.
) else (
    echo [2/5] Dependencies already installed
    echo.
)

REM Check if config exists
if not exist "config\config.json" (
    echo [3/5] Creating config file...
    copy config\config.example.json config\config.json >nul
    echo Config file created at: config\config.json
    echo You'll need to add your Upstox API credentials later
    echo.
) else (
    echo [3/5] Config file already exists
    echo.
)

REM Run verification
echo [4/5] Running setup verification...
call node verify-setup.js
echo.

REM Provide next steps
echo [5/5] Setup complete!
echo.
echo ============================================================
echo WHAT'S NEXT?
echo ============================================================
echo.
echo Option 1: QUICK TEST (No API needed)
echo   - Run: npm run generate-sample
echo   - Run: npm run backtest
echo   - This uses synthetic test data
echo.
echo Option 2: REAL BACKTEST (Requires Upstox API)
echo   - Edit config\config.json with your Upstox credentials
echo   - Run: npm run fetch-data
echo   - Run: npm run backtest
echo   - This uses real historical market data
echo.
echo Documentation:
echo   - Quick start: QUICKSTART.md
echo   - Full setup: SETUP.md
echo   - FAQ: FAQ.md
echo.
echo ============================================================
echo.

choice /C YN /M "Would you like to generate sample data and run a test backtest now"
if %errorlevel%==1 (
    echo.
    echo Generating sample data...
    call npm run generate-sample
    echo.
    echo Running backtest...
    call npm run backtest
)

echo.
echo Done! Check the results above.
echo.
pause
