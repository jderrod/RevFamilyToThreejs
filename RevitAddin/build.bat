@echo off
setlocal

:: Build script for RevitFamilyToGLB Add-in
echo Building RevitFamilyToGLB Add-in...
echo.

:: Set variables
set SOLUTION_PATH=RevitFamilyToGLB.csproj
set MSBUILD="C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe"
set REVIT_VERSION=2026

:: Check if MSBuild exists
if not exist %MSBUILD% (
    echo Error: MSBuild not found at %MSBUILD%
    echo Please update the MSBUILD path in this script
    exit /b 1
)

:: Restore NuGet packages
echo Restoring NuGet packages...
%MSBUILD% %SOLUTION_PATH% -t:Restore -p:Configuration=Debug

:: Build the project
echo.
echo Building project...
%MSBUILD% %SOLUTION_PATH% -p:Configuration=Debug -p:Platform=x64

:: Check build result
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Build failed!
    exit /b %ERRORLEVEL%
)

echo.
echo Build successful!
echo.

:: Copy add-in manifest to Revit addins folder
echo Installing add-in manifest...
set ADDIN_FOLDER=%APPDATA%\Autodesk\Revit\Addins\%REVIT_VERSION%
if not exist "%ADDIN_FOLDER%" mkdir "%ADDIN_FOLDER%"

copy /Y "bin\Debug\RevitFamilyToGLB.addin" "%ADDIN_FOLDER%\" > nul

if %ERRORLEVEL% EQU 0 (
    echo Add-in manifest installed to: %ADDIN_FOLDER%
) else (
    echo Failed to copy add-in manifest. Please copy manually.
)

echo.
echo Build complete!
echo.
echo Next steps:
echo 1. The add-in DLL is in: bin\Debug\
echo 2. The add-in manifest has been copied to: %ADDIN_FOLDER%
echo 3. Start Revit %REVIT_VERSION% and look for "Export Family to GLB" in Add-Ins menu
echo.

pause
