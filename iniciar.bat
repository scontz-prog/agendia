@echo off
REM ====================================================================
REM  Agendia - servidor local
REM
REM  De dois cliques neste arquivo para abrir o sistema no navegador.
REM  A janela preta que aparece E o servidor: deixe aberta enquanto
REM  estiver usando, e feche quando terminar.
REM
REM  Por que precisa de servidor: o sistema usa modulos ES, que o
REM  navegador se recusa a carregar em arquivos abertos direto do disco
REM  (file://). Servir por HTTP resolve.
REM ====================================================================

cd /d "%~dp0"

set PORTA=8124
set ENDERECO=http://localhost:%PORTA%/entrar.html

REM Se ja houver um servidor nessa porta, so abre o navegador.
netstat -ano | findstr ":%PORTA% " | findstr LISTENING >nul 2>&1
if %errorlevel%==0 (
  echo.
  echo  Ja existe um servidor rodando na porta %PORTA%.
  echo  Abrindo o navegador...
  echo.
  start "" "%ENDERECO%"
  timeout /t 3 >nul
  exit /b
)

set PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
if not exist "%PY%" set PY=python

echo.
echo  ================================================================
echo   Agendia rodando em http://localhost:%PORTA%
echo  ================================================================
echo.
echo   Painel da barbearia .... demo@agendia.local  / 123456
echo   Administracao .......... admin@agendia.local / 123456
echo.
echo   Feche esta janela para parar o servidor.
echo.

start "" "%ENDERECO%"
REM servidor.py e o http.server do Python com "no-store" nos cabecalhos,
REM para o navegador nao servir JS antigo do cache depois de uma edicao.
"%PY%" servidor.py %PORTA%
