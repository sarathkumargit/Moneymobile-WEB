@echo off
setlocal enabledelayedexpansion
title MoneyMobile - Phone Setup
cd /d "%~dp0"

echo.
echo  =====================================================
echo    MoneyMobile - Phone Setup
echo  =====================================================
echo.

:: -- config --------------------------------------------
if not exist config.txt (
  echo [ERROR] config.txt is missing. Download it from the website
  echo         ^(Settings ^> Device setup^) and keep it in this folder.
  pause & exit /b 1
)
set SHOP_ID=
set SHOP_SECRET=
set SERVER_URL=
for /f "usebackq tokens=1,* delims==" %%a in ("config.txt") do (
  set "key=%%a"
  set "key=!key: =!"
  if /i "!key!"=="SHOP_ID" set "SHOP_ID=%%b"
  if /i "!key!"=="SHOP_SECRET" set "SHOP_SECRET=%%b"
  if /i "!key!"=="SERVER_URL" set "SERVER_URL=%%b"
)
set "SHOP_ID=%SHOP_ID: =%"
set "SHOP_SECRET=%SHOP_SECRET: =%"
if "%SHOP_ID%"=="" ( echo [ERROR] config.txt is missing SHOP_ID or SHOP_SECRET. & pause & exit /b 1 )
if "%SHOP_SECRET%"=="" ( echo [ERROR] config.txt is missing SHOP_ID or SHOP_SECRET. & pause & exit /b 1 )

if not exist MoneyMobile.apk ( echo [ERROR] MoneyMobile.apk is missing from this folder. & pause & exit /b 1 )

:: -- adb (download platform-tools if missing) ----------
set "ADB=adb"
where adb >nul 2>&1
if %errorlevel% neq 0 (
  if exist "platform-tools\adb.exe" (
    set "ADB=platform-tools\adb.exe"
  ) else (
    echo [1/5] Android tools not found - downloading ^(one time^)...
    powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' -OutFile 'platform-tools.zip' } catch { exit 1 }"
    if !errorlevel! neq 0 ( echo [ERROR] Could not download Android tools. Check the internet connection. & pause & exit /b 1 )
    powershell -NoProfile -Command "Expand-Archive -Force 'platform-tools.zip' '.'"
    set "ADB=platform-tools\adb.exe"
    echo [OK] Tools ready.
  )
)

echo.
echo [2/5] Waiting for the phone ^(plug in via USB, allow USB debugging^)...
"%ADB%" wait-for-device
for /f "tokens=*" %%s in ('"%ADB%" get-state 2^>nul') do set DEVICE_STATE=%%s
if not "!DEVICE_STATE!"=="device" (
  echo [ERROR] Phone not ready. Enable USB Debugging and tap Allow on the phone.
  pause & exit /b 1
)
rem The phone can take a few seconds to answer right after connecting: ask again until it does.
set "BRAND=" & set "MODEL=" & set /a MM_TRY=0
:get_brand
for /f "delims=" %%i in ('"%ADB%" shell getprop ro.product.manufacturer 2^>nul') do set BRAND=%%i
for /f "delims=" %%i in ('"%ADB%" shell getprop ro.product.model 2^>nul') do set MODEL=%%i
set /a MM_TRY+=1
if not defined BRAND if !MM_TRY! lss 10 ( timeout /t 2 /nobreak >nul & goto get_brand )
echo [OK] Connected: !BRAND! !MODEL!

:: Already managed by MoneyMobile? Then this run is just an app UPDATE (keeps customer + lock status).
"%ADB%" shell "dumpsys device_policy | grep -A3 'Device Owner'" 2>nul | findstr /C:"com.moneymobile.installment" >nul
if !errorlevel! equ 0 (
  echo.
  echo [3/3] This phone is already set up - updating the app only...
  call :install_app
  copy /y "%TEMP%\mm_inst.txt" "%TEMP%\mm_upd.txt" >nul
  echo.
  echo  =====================================================
  findstr /I /C:"Success" "%TEMP%\mm_upd.txt" >nul
  if !errorlevel! equ 0 (
    set "URL=!SERVER_URL!"
    if "!URL!"=="" (
      for /f "usebackq delims=" %%a in (`powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null } | Select-Object -First 1).IPv4Address.IPAddress"`) do set "PC_IP=%%a"
      if not "!PC_IP!"=="" set "URL=http://!PC_IP!:3000/api"
    )
    if not "!URL!"=="" (
      "%ADB%" shell am start -n com.moneymobile.installment/.ui.EnrollmentActivity --es action "UPDATE_SERVER_URL" --es server_url "!URL!" >nul 2>&1
      echo    Server address refreshed: !URL!
    ) else (
      "%ADB%" shell am start -n com.moneymobile.installment/.ui.SplashActivity >nul 2>&1
    )
    call :keep_running
    echo    DONE - !BRAND! !MODEL! updated.
    echo    Customer, registration and lock status are unchanged.
    echo.
    echo    Phone still shows Pending, or you deleted it on the website?
    choice /C RN /T 10 /D N /M "   Press R to register it again (N or wait = skip)"
    if !errorlevel! equ 1 (
      "%ADB%" shell am start -n com.moneymobile.installment/.ui.EnrollmentActivity --es action "REGISTER_DEVICE" --es shop_id "!SHOP_ID!" --es enroll_secret "!SHOP_SECRET!" --es server_url "!URL!" >nul 2>&1
      echo    Registration sent. The phone appears in Devices on the website in about a minute.
      echo    Then assign it to the customer again.
    )
  ) else (
    findstr /I /C:"DOWNGRADE" "%TEMP%\mm_upd.txt" >nul
    if !errorlevel! equ 0 ( echo    Already up to date - the phone has this version or newer. ) else ( echo    [ERROR] Update failed - see the message above. )
  )
  echo  =====================================================
  echo.
  pause & exit /b 0
)

echo.
echo [3/5] New phone - installing the app...
set "MM_HAVE_APP="
rem Already installed ^(an earlier run, or installed on the phone itself from the APK file^): skip.
"%ADB%" shell pm path com.moneymobile.installment 2>nul | findstr /C:"package:" >nul && set "MM_HAVE_APP=old"
if not defined MM_HAVE_APP (
  call :install_app
  if "!MM_INSTALL!"=="OK" set "MM_HAVE_APP=new"
)
if not defined MM_HAVE_APP (
  "%ADB%" shell pm path com.moneymobile.installment 2>nul | findstr /C:"package:" >nul && set "MM_HAVE_APP=old"
)
if not defined MM_HAVE_APP (
  echo.
  echo [ERROR] Install failed - see the message above.
  call :xiaomi_help
  pause & exit /b 1
)
if "!MM_HAVE_APP!"=="new" ( echo [OK] Installed. ) else ( echo [OK] The app is already on the phone ^(from the earlier run^) - continuing. )

echo.
echo [4/5] Enabling full management ^(Device Owner^)...
set ALREADY=
"%ADB%" shell "dumpsys device_policy | grep -A3 'Device Owner'" 2>nul | findstr /C:"com.moneymobile.installment" >nul
if !errorlevel! equ 0 ( echo [OK] Already set. & set ALREADY=1 )
if not defined ALREADY (
  "%ADB%" shell dpm set-device-owner com.moneymobile.installment/.admin.DeviceAdminReceiver > "%TEMP%\mm_dpm.txt" 2>&1
  type "%TEMP%\mm_dpm.txt"
  findstr /I /C:"Success" "%TEMP%\mm_dpm.txt" >nul
  if !errorlevel! neq 0 (
    echo.
    echo [ERROR] Could not enable management.
    set "MM_WHY="
    findstr /I /C:"account" "%TEMP%\mm_dpm.txt" >nul && set "MM_WHY=account"
    if not defined MM_WHY findstr /I /C:"provisioned" /C:"already" /C:"users" "%TEMP%\mm_dpm.txt" >nul && set "MM_WHY=used"
    if "!MM_WHY!"=="account" (
      echo  An account is still signed in. Remove ALL of these ^(Settings ^> Accounts^), WhatsApp can stay:
      "%ADB%" shell dumpsys account 2>nul | findstr /C:"Account {" | findstr /V /C:"Session:"
      echo  Xiaomi account: Settings ^> Xiaomi account ^> Sign out ^(let it turn off Find device^).
      echo  Then run this file again - the app is already installed, so it continues from here.
    ) else if "!MM_WHY!"=="used" (
      echo  This phone was already set up before ^(or has a second user / Second space^).
      echo  Factory reset it, skip all accounts, and run this file again.
    ) else (
      echo  Xiaomi / Redmi / Poco: Developer options ^> turn ON "USB debugging ^(Security settings^)".
      echo  Xiaomi asks you to sign in to a Mi account to switch it on: sign in, switch it on,
      echo  then sign OUT again ^(Settings ^> Xiaomi account ^> Sign out^) and run this file again.
      echo  Other brands: see the message above.
    )
    pause & exit /b 1
  )
)

call :keep_running
echo.
echo [5/5] Registering the phone with the shop...
"%ADB%" logcat -c >nul 2>&1
rem Server address for the phone: SERVER_URL from config.txt, or - if the MoneyMobile server
rem runs on THIS computer - this computer's current network IP.
if "!SERVER_URL!"=="" (
  curl -s -m 3 -o nul http://localhost:3000/login >nul 2>&1
  if !errorlevel! equ 0 (
    for /f "usebackq delims=" %%a in (`powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null } | Select-Object -First 1).IPv4Address.IPAddress"`) do set "PC_IP=%%a"
    if not "!PC_IP!"=="" set "SERVER_URL=http://!PC_IP!:3000/api"
  ) else (
    echo       [!] The MoneyMobile server is not running on this computer - set SERVER_URL in config.txt.
  )
)
set "SERVER_ARG="
if not "!SERVER_URL!"=="" (
  echo       Server for the phone: !SERVER_URL!
  set "SERVER_ARG=--es server_url !SERVER_URL!"
)
"%ADB%" shell am start -W -n com.moneymobile.installment/.ui.EnrollmentActivity --es action "REGISTER_DEVICE" --es shop_id "%SHOP_ID%" --es enroll_secret "%SHOP_SECRET%" !SERVER_ARG! > "%TEMP%\mm_start.txt" 2>&1
findstr /I /C:"Error" "%TEMP%\mm_start.txt" >nul
if !errorlevel! equ 0 (
  echo [ERROR] Could not open the MoneyMobile app on the phone:
  type "%TEMP%\mm_start.txt"
  pause & exit /b 1
)

rem The app saves the shop details immediately and reports the result in the log - tag MMEnroll.
set "MMDONE="
for /L %%i in (1,1,25) do (
  if not defined MMDONE (
    "%ADB%" logcat -d -s MMEnroll:I MMEnroll:W > "%TEMP%\mm_enroll.txt" 2>nul
    findstr /C:"RESULT=OK" "%TEMP%\mm_enroll.txt" >nul && set "MMDONE=OK"
    if not defined MMDONE findstr /C:"RESULT=FAIL" "%TEMP%\mm_enroll.txt" >nul && set "MMDONE=FAIL"
    if not defined MMDONE timeout /t 2 /nobreak >nul
  )
)

echo.
echo  =====================================================
if "!MMDONE!"=="OK" (
  echo    DONE - !BRAND! !MODEL! is registered to your shop.
  echo    Find it by its IMEI on the website and assign it to
  echo    a customer. You can unplug the phone now.
) else if "!MMDONE!"=="FAIL" (
  echo    [ERROR] The server refused the registration:
  findstr /C:"RESULT=FAIL" "%TEMP%\mm_enroll.txt"
  echo    Download a fresh config.txt from the website
  echo    - Settings ^> Device setup - and run this again.
) else (
  echo    ALMOST DONE - the app is installed and the shop ID is
  echo    SAVED on the phone, but it can't reach the server yet.
  findstr /C:"RESULT=NETWORK" "%TEMP%\mm_enroll.txt"
  echo    Connect the phone to the same Wi-Fi as the server and
  echo    make sure the server is running. The phone registers
  echo    by itself - no need to type anything or run this again.
)
echo  =====================================================
echo.
pause
exit /b 0

:: -- Install the app ----------------------------------------------------------
:: Every brand: 1) adb install (with -g, except Xiaomi: it refuses -g and drops the connection),
:: each try limited in time so a phone that never answers can't hang the setup; 2) if that fails,
:: the APK is copied to the phone and installed ON the phone. Path 2 needs no Mi account and no
:: "Install via USB" - it is how Xiaomi / Redmi / Poco always work. Nothing is lost without -g:
:: once MoneyMobile is Device Owner it grants its own permissions.
:install_app
set "MM_INSTALL="
call :app_vc MM_VC_BEFORE
echo !BRAND! | findstr /I "xiaomi redmi poco" >nul
if !errorlevel! neq 0 (
  call :adb_install_limited "-g" 120
  findstr /C:"Success" "%TEMP%\mm_inst.txt" >nul 2>&1 && set "MM_INSTALL=OK"
  if not defined MM_INSTALL (
    echo       First try was refused - trying again...
    timeout /t 3 /nobreak >nul
  )
) else (
  echo       Xiaomi phone - tap Install on the phone if it asks...
)
if not defined MM_INSTALL (
  call :adb_install_limited "" 90
  findstr /C:"Success" "%TEMP%\mm_inst.txt" >nul 2>&1 && set "MM_INSTALL=OK"
)
if not defined MM_INSTALL call :install_on_phone
type "%TEMP%\mm_inst.txt"
exit /b 0

:: adb install, at most %2 seconds (output in mm_inst.txt).
:adb_install_limited
del /q "%TEMP%\mm_inst.txt" "%TEMP%\mm_inst.done" 2>nul
start "" /b cmd /c ""%ADB%" install -r %~1 MoneyMobile.apk > "%TEMP%\mm_inst.txt" 2>&1 & echo done> "%TEMP%\mm_inst.done""
set /a MM_T=0
:ail_wait
if exist "%TEMP%\mm_inst.done" exit /b 0
if !MM_T! geq %~2 (
  taskkill /f /im adb.exe >nul 2>&1
  timeout /t 2 /nobreak >nul
  echo No answer from the phone after %~2 seconds.>> "%TEMP%\mm_inst.txt"
  "%ADB%" start-server >nul 2>&1
  exit /b 0
)
timeout /t 2 /nobreak >nul
set /a MM_T+=2
goto ail_wait

:: Copy the APK to the phone and let the phone's own installer install it.
:install_on_phone
echo       Copying the app to the phone and installing it there...
set "MM_WEB=!SERVER_URL!"
if "!MM_WEB:~-1!"=="/" set "MM_WEB=!MM_WEB:~0,-1!"
if /i "!MM_WEB:~-4!"=="/api" set "MM_WEB=!MM_WEB:~0,-4!"
call :adb_push_limited 60
findstr /I /C:"pushed" "%TEMP%\mm_push.txt" >nul 2>&1
if !errorlevel! equ 0 (
  "%ADB%" shell am start -a android.intent.action.VIEW -t application/vnd.android.package-archive -d file:///sdcard/Download/MoneyMobile.apk >nul 2>&1
  echo.
  echo       ^>^>^> ON THE PHONE: tap INSTALL ^(choose "Install anyway" if Xiaomi warns^).
  echo           Nothing opened? File Manager ^> Downloads ^> MoneyMobile.apk ^> Install
  echo           ^(allow "install unknown apps" for File Manager if it asks^).
) else (
  echo.
  echo       ^>^>^> The USB connection is not answering. Install the app ON THE PHONE instead:
  if defined MM_WEB ( echo           open Chrome on the phone and go to:  !MM_WEB!/api/setup-kit/apk?src=bundled ) else ( echo           open Chrome on the phone and download MoneyMobile.apk from your MoneyMobile website ^(Install App^) )
  echo           then open the download and tap Install ^(allow Chrome to install apps if it asks^).
)
echo           Waiting up to 5 minutes ^(keep the cable plugged in^)...
set /a MM_T=0
:iop_wait
call :app_vc MM_VC_NOW
if defined MM_VC_NOW if not "!MM_VC_NOW!"=="!MM_VC_BEFORE!" (
  echo Success ^(installed on the phone^)> "%TEMP%\mm_inst.txt"
  set "MM_INSTALL=OK"
  exit /b 0
)
if !MM_T! geq 300 (
  echo The app was not installed on the phone within 5 minutes.> "%TEMP%\mm_inst.txt"
  exit /b 0
)
timeout /t 3 /nobreak >nul
set /a MM_T+=3
goto iop_wait

:: adb push of the APK, at most %1 seconds (output in mm_push.txt).
:adb_push_limited
del /q "%TEMP%\mm_push.txt" "%TEMP%\mm_push.done" 2>nul
start "" /b cmd /c ""%ADB%" push MoneyMobile.apk /sdcard/Download/MoneyMobile.apk > "%TEMP%\mm_push.txt" 2>&1 & echo done> "%TEMP%\mm_push.done""
set /a MM_T=0
:apl_wait
if exist "%TEMP%\mm_push.done" exit /b 0
if !MM_T! geq %~1 (
  taskkill /f /im adb.exe >nul 2>&1
  timeout /t 2 /nobreak >nul
  "%ADB%" start-server >nul 2>&1
  exit /b 0
)
timeout /t 2 /nobreak >nul
set /a MM_T+=2
goto apl_wait

:: Installed app's versionCode into the variable named %1 (empty when not installed).
:app_vc
set "%~1="
for /f "tokens=2 delims== " %%v in ('"%ADB%" shell dumpsys package com.moneymobile.installment 2^>nul ^| findstr /C:"versionCode="') do if not defined %~1 set "%~1=%%v"
exit /b 0

:: Keeps MoneyMobile running in the background (Xiaomi / Infinix / Tecno battery savers stop apps
:: otherwise, the usual reason a phone stops checking in).
:keep_running
"%ADB%" shell dumpsys deviceidle whitelist +com.moneymobile.installment >nul 2>&1
"%ADB%" shell cmd appops set com.moneymobile.installment RUN_IN_BACKGROUND allow >nul 2>&1
"%ADB%" shell cmd appops set com.moneymobile.installment RUN_ANY_IN_BACKGROUND allow >nul 2>&1
exit /b 0

:xiaomi_help
echo !BRAND! | findstr /I "xiaomi redmi poco" >nul
if !errorlevel! equ 0 (
  echo.
  echo  Xiaomi / Redmi / Poco: keep the phone UNLOCKED and run this file again.
  echo  When it says "ON THE PHONE: tap INSTALL", tap Install on the phone.
)
exit /b 0
