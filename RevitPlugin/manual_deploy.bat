@echo off
set BUILD_DIR=c:\Users\Robin\Downloads\VH_IFC_Viewer\RevitPlugin\bin\Release\net8.0-windows
set ADDIN_DIR=%AppData%\Autodesk\Revit\Addins\2025
set DLL_DIR=%ADDIN_DIR%\VH_IFC_QR

echo 1. Creating directories...
if not exist "%DLL_DIR%" mkdir "%DLL_DIR%"

echo 2. Copying binaries...
xcopy /Y /S "%BUILD_DIR%\*" "%DLL_DIR%\"

echo 3. Copying manifest...
copy /Y "c:\Users\Robin\Downloads\VH_IFC_Viewer\RevitPlugin\VH_IFC_QR.addin" "%ADDIN_DIR%\"

echo 4. Verifying...
dir "%DLL_DIR%"
dir "%ADDIN_DIR%\VH_IFC_QR.addin"

echo Deployment complete!
