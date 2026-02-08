@echo off
echo Testing CORS options...
curl -I -X OPTIONS http://localhost:3001/api/users ^
  -H "Origin: https://vh-ifc-viewer.vercel.app" ^
  -H "Access-Control-Request-Method: GET"

echo.
echo Testing cookie response...
curl -v -X POST http://localhost:3001/api/auth/login ^
  -H "Content-Type: application/json" ^
  -H "Origin: https://vh-ifc-viewer.vercel.app" ^
  -d "{\"username\":\"admin\",\"password\":\"admin123\"}"
