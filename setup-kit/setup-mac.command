#!/bin/bash
# MoneyMobile — one-click phone setup (macOS). Double-click to run.
# Works for BOTH:  a new / factory-reset phone  -> installs, turns on management, registers it
#                  a phone that's already set up -> only updates the app (keeps customer + lock status)
set -e
cd "$(dirname "$0")"

echo ""
echo " ====================================================="
echo "   MoneyMobile — Phone Setup"
echo " ====================================================="
echo ""

# ── config ──────────────────────────────────────────────
if [ ! -f config.txt ]; then
  echo "[ERROR] config.txt is missing. Download it from the website (Settings > Device setup)"
  echo "        and keep it in this folder."
  read -n 1 -s -r -p "Press any key to close."; exit 1
fi
SHOP_ID=""; SHOP_SECRET=""; SERVER_URL=""
while IFS='=' read -r k v; do
  k="$(echo "$k" | tr -d ' \r')"; v="$(echo "$v" | tr -d ' \r')"
  [ "$k" = "SHOP_ID" ] && SHOP_ID="$v"
  [ "$k" = "SHOP_SECRET" ] && SHOP_SECRET="$v"
  [ "$k" = "SERVER_URL" ] && SERVER_URL="$v"
done < config.txt
if [ -z "$SHOP_ID" ] || [ -z "$SHOP_SECRET" ]; then
  echo "[ERROR] config.txt is missing SHOP_ID or SHOP_SECRET."
  read -n 1 -s -r -p "Press any key to close."; exit 1
fi

if [ ! -f MoneyMobile.apk ]; then
  echo "[ERROR] MoneyMobile.apk is missing from this folder."
  read -n 1 -s -r -p "Press any key to close."; exit 1
fi

# ── adb (download platform-tools if missing) ────────────
ADB="adb"
if ! command -v adb >/dev/null 2>&1; then
  if [ -x ./platform-tools/adb ]; then
    ADB="./platform-tools/adb"
  else
    echo "[1/5] Android tools not found — downloading (one time)..."
    curl -fsSL -o platform-tools.zip "https://dl.google.com/android/repository/platform-tools-latest-darwin.zip"
    unzip -oq platform-tools.zip
    ADB="./platform-tools/adb"
    echo "[OK] Tools ready."
  fi
fi

# ── Installing the app ─────────────────────────────────────────────────────────────────────────
# Every brand: 1) adb install (with -g, except Xiaomi — it refuses -g and drops the connection),
# each try limited in time so a phone that never answers can't hang the setup; 2) if that fails,
# the APK is copied to the phone and installed ON the phone (package installer). Path 2 needs no
# Mi account and no "Install via USB" — it is how Xiaomi / Redmi / Poco always work.
APK_ON_PHONE="/sdcard/Download/MoneyMobile.apk"
is_xiaomi() { echo "$BRAND" | grep -qiE "xiaomi|redmi|poco"; }
app_vc() { "$ADB" shell dumpsys package com.moneymobile.installment 2>/dev/null | tr -d '\r' | grep -m1 -o 'versionCode=[0-9]*' || true; }
# Runs "adb <args>" for at most <secs> seconds; the output goes to $OUT.
adb_limited() {
  local secs=$1; shift
  local tmp; tmp=$(mktemp -t mmadb)
  "$ADB" "$@" >"$tmp" 2>&1 &
  local pid=$! n=0
  while kill -0 "$pid" 2>/dev/null; do
    sleep 1; n=$((n+1))
    if [ "$n" -ge "$secs" ]; then kill "$pid" 2>/dev/null || true; echo "No answer from the phone after ${secs}s." >>"$tmp"; break; fi
  done
  wait "$pid" 2>/dev/null || true
  OUT=$(tr -d '\r' <"$tmp"); rm -f "$tmp"
}
install_on_phone() {
  local before=$1
  echo "      Copying the app to the phone and installing it there..."
  local web=""; [ -n "$SERVER_URL" ] && web="${SERVER_URL%/}"; web="${web%/api}"
  adb_limited 60 push MoneyMobile.apk "$APK_ON_PHONE"
  if echo "$OUT" | grep -qi "pushed"; then
    "$ADB" shell am start -a android.intent.action.VIEW -t application/vnd.android.package-archive -d "file://$APK_ON_PHONE" >/dev/null 2>&1 || true
    echo ""
    echo "      >>> ON THE PHONE: tap INSTALL (choose \"Install anyway\" if Xiaomi warns)."
    echo "          Nothing opened? File Manager > Downloads > MoneyMobile.apk > Install"
    echo "          (allow \"install unknown apps\" for File Manager if it asks)."
  else
    echo ""
    echo "      >>> The USB connection is not answering. Install the app ON THE PHONE instead:"
    if [ -n "$web" ]; then echo "          open Chrome on the phone and go to:  $web/api/setup-kit/apk?src=bundled"
    else echo "          open Chrome on the phone and download MoneyMobile.apk from your MoneyMobile website (Install App)"; fi
    echo "          then open the download and tap Install (allow Chrome to install apps if it asks)."
  fi
  echo "          Waiting up to 5 minutes (keep the cable plugged in)..."
  local i now
  for i in $(seq 1 100); do
    now=$(app_vc)
    if [ -n "$now" ] && [ "$now" != "$before" ]; then OUT="Success (installed on the phone)"; return 0; fi
    sleep 3
  done
  OUT="The app was not installed on the phone within 5 minutes."; return 1
}
install_apk() {
  local before; before=$(app_vc)
  if ! is_xiaomi; then
    adb_limited 120 install -r -g MoneyMobile.apk
    if echo "$OUT" | grep -q "Success"; then echo "$OUT"; return 0; fi
    echo "      First try was refused — trying again..."
    adb_limited 30 wait-for-device
  else
    echo "      Xiaomi phone — tap Install on the phone if it asks..."
  fi
  adb_limited 90 install -r MoneyMobile.apk
  if echo "$OUT" | grep -q "Success"; then echo "$OUT"; return 0; fi
  echo "$OUT" | tail -2 | sed 's/^/      /'
  if install_on_phone "$before"; then echo "$OUT"; return 0; fi
  echo "$OUT"; return 1
}
# Keeps MoneyMobile running in the background: Xiaomi / Infinix / Tecno battery savers stop apps
# otherwise, which is the usual reason a phone stops checking in.
keep_running() {
  "$ADB" shell dumpsys deviceidle whitelist +com.moneymobile.installment >/dev/null 2>&1 || true
  "$ADB" shell cmd appops set com.moneymobile.installment RUN_IN_BACKGROUND allow >/dev/null 2>&1 || true
  "$ADB" shell cmd appops set com.moneymobile.installment RUN_ANY_IN_BACKGROUND allow >/dev/null 2>&1 || true
}
xiaomi_help() {
  if is_xiaomi; then
    echo ""
    echo " Xiaomi / Redmi / Poco: keep the phone UNLOCKED and run this file again."
    echo " When it says \"ON THE PHONE: tap INSTALL\", tap Install on the phone."
  fi
}

echo ""
echo "[2/5] Waiting for the phone (plug in via USB, allow USB debugging)..."
"$ADB" wait-for-device
STATE=$("$ADB" get-state 2>/dev/null || echo unknown)
if [ "$STATE" != "device" ]; then
  echo "[ERROR] Phone not ready (state: $STATE). Enable USB Debugging and tap Allow on the phone."
  read -n 1 -s -r -p "Press any key to close."; exit 1
fi
# The phone can take a few seconds to answer right after connecting: ask again until it does.
BRAND=""; MODEL=""
for i in 1 2 3 4 5 6 7 8 9 10; do
  BRAND=$("$ADB" shell getprop ro.product.manufacturer 2>/dev/null | tr -d '\r' || true)
  MODEL=$("$ADB" shell getprop ro.product.model 2>/dev/null | tr -d '\r' || true)
  [ -n "$BRAND" ] && break
  sleep 2
done
echo "[OK] Connected: $BRAND $MODEL"
if is_xiaomi; then
  SECSET=$("$ADB" shell getprop persist.security.adbinput 2>/dev/null | tr -d '\r')
  if [ "$SECSET" = "0" ]; then
    echo "      [!] Xiaomi: \"USB debugging (Security settings)\" looks OFF — step 4 needs it ON."
  fi
fi

# Already managed by MoneyMobile? Then this run is just an app UPDATE — registering again would
# give the phone a new identity and break its link to the customer.
if "$ADB" shell "dumpsys device_policy | grep -A3 'Device Owner'" 2>/dev/null | tr -d '\r' | grep -q "com.moneymobile.installment"; then
  OLDV=$("$ADB" shell dumpsys package com.moneymobile.installment 2>/dev/null | tr -d '\r' | grep -m1 versionName | sed 's/.*=//')
  echo ""
  echo "[3/3] This phone is already set up (app v${OLDV:-?}) — updating the app only..."
  install_apk || true
  echo ""
  echo " ====================================================="
  if echo "$OUT" | grep -qi "Success"; then
    # Refresh the phone's server address in case this computer's Wi-Fi IP changed since setup
    # (a stale address is the usual reason an updated phone still shows "offline").
    IFACE=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
    MAC_IP=$(ipconfig getifaddr "${IFACE:-en0}" 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
    URL="$SERVER_URL"; [ -z "$URL" ] && [ -n "$MAC_IP" ] && URL="http://$MAC_IP:3000/api"
    if [ -n "$URL" ]; then
      "$ADB" shell am start -n com.moneymobile.installment/.ui.EnrollmentActivity --es action "UPDATE_SERVER_URL" --es server_url "$URL" >/dev/null 2>&1 || true
      echo "   Server address refreshed: $URL"
    else
      "$ADB" shell am start -n com.moneymobile.installment/.ui.SplashActivity >/dev/null 2>&1 || true
    fi
    NEWV=$("$ADB" shell dumpsys package com.moneymobile.installment 2>/dev/null | tr -d '\r' | grep -m1 versionName | sed 's/.*=//')
    keep_running
    echo "   DONE — $BRAND $MODEL updated to v${NEWV:-new}."
    echo "   Customer, registration and lock status are unchanged."
    echo ""
    echo "   Phone still shows Pending, or you deleted it on the website?"
    read -t 10 -n 1 -s -r -p "   Press R within 10 seconds to register it again (or wait to skip): " REREG || true
    echo ""
    if [ "$REREG" = "r" ] || [ "$REREG" = "R" ]; then
      "$ADB" shell am start -n com.moneymobile.installment/.ui.EnrollmentActivity \
        --es action "REGISTER_DEVICE" --es shop_id "$SHOP_ID" --es enroll_secret "$SHOP_SECRET" \
        ${URL:+--es server_url "$URL"} >/dev/null 2>&1 || true
      echo "   Registration sent. The phone appears in Devices on the website in about a minute"
      echo "   (it must have internet). Then assign it to the customer again."
    fi
  elif echo "$OUT" | grep -qi "DOWNGRADE"; then
    echo "   Already up to date — the phone has this version or newer."
  else
    echo "   [ERROR] Update failed (see the message above)."
  fi
  echo " ====================================================="
  echo ""
  read -n 1 -s -r -p "Press any key to close."; exit 0
fi

echo ""
echo "[3/5] New phone — installing the app..."
OUT=""
if "$ADB" shell pm path com.moneymobile.installment 2>/dev/null | grep -q "package:"; then
  # Already installed (an earlier run, or installed on the phone itself from the APK file): skip.
  echo "[OK] The app is already on the phone — skipping the install."
elif install_apk; then
  echo "[OK] Installed."
elif "$ADB" shell pm path com.moneymobile.installment 2>/dev/null | grep -q "package:"; then
  # Installed on an earlier run (e.g. Xiaomi: installed with the Mi account signed in, then the
  # Mi account was removed for step 4 and "Install via USB" switched itself off). Carry on.
  echo "[OK] The app is already on the phone (from the earlier run) — continuing."
else
  echo ""
  echo "[ERROR] Install failed (see the message above)."
  xiaomi_help
  read -n 1 -s -r -p "Press any key to close."; exit 1
fi

echo ""
echo "[4/5] Enabling full management (Device Owner)..."
PKG="com.moneymobile.installment/.admin.DeviceAdminReceiver"
if "$ADB" shell "dumpsys device_policy | grep -A3 'Device Owner'" 2>/dev/null | tr -d '\r' | grep -q "com.moneymobile.installment"; then
  echo "[OK] Already set."
else
  OUT=$("$ADB" shell dpm set-device-owner "$PKG" 2>&1 | tr -d '\r'); echo "$OUT"
  if ! echo "$OUT" | grep -qi "Success"; then
    echo ""
    echo "[ERROR] Could not enable management."
    if echo "$OUT" | grep -qi "account"; then
      echo " An account is still signed in. Remove ALL of these (Settings > Accounts), WhatsApp can stay:"
      "$ADB" shell dumpsys account 2>/dev/null | tr -d '\r' | grep "Account {" | grep -v "Session:" | sort -u | sed 's/^ */   - /'
      if is_xiaomi; then
        echo " Xiaomi account: Settings > Xiaomi account > Sign out (let it turn off Find device)."
      fi
      echo " Then run this file again — the app is already installed, so it continues from here."
    elif echo "$OUT" | grep -qiE "provisioned|already (has|set)|users|device owner is already"; then
      echo " This phone was already set up before (or has a second user / Second space)."
      echo " Factory reset it, skip all accounts, and run this file again."
    elif is_xiaomi; then
      echo " Xiaomi / Redmi / Poco: Developer options > turn ON \"USB debugging (Security settings)\"."
      echo " Xiaomi asks you to sign in to a Mi account to switch it on: sign in, switch it on,"
      echo " then sign OUT again (Settings > Xiaomi account > Sign out) and run this file again."
    else
      echo " See the message above. Usually: an account is signed in, or the phone was already set up."
    fi
    read -n 1 -s -r -p "Press any key to close."; exit 1
  fi
fi

keep_running
echo ""
echo "[5/5] Registering the phone with the shop..."
# Server address for the phone. config.txt may set SERVER_URL (e.g. http://192.168.1.20:3000/api).
# Otherwise, if the MoneyMobile server is running on THIS Mac, use this Mac's current Wi-Fi IP —
# so a changed IP address no longer breaks the phone.
# 2-second connect test (macOS nc); falls back to bash /dev/tcp.
port_open() {
  if command -v nc >/dev/null 2>&1; then nc -z -G 2 "$1" "$2" >/dev/null 2>&1
  else (exec 3<>"/dev/tcp/$1/$2") >/dev/null 2>&1; fi
}
if [ -z "$SERVER_URL" ]; then
  # Always hand the phone THIS Mac's current Wi-Fi IP (the server normally runs here).
  IFACE=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
  MAC_IP=$(ipconfig getifaddr "${IFACE:-en0}" 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
  [ -n "$MAC_IP" ] && SERVER_URL="http://$MAC_IP:3000/api"
  # Port check only (instant) — an HTTP request can take 10s+ while "npm run dev" compiles a page.
  if ! port_open 127.0.0.1 3000 && ! port_open localhost 3000; then
    echo "      [!] Nothing is running on port 3000 on this Mac. Start the website"
    echo "          (npm run dev or npm start) — the phone will connect as soon as it is up."
  fi
fi
if [ -n "$SERVER_URL" ]; then
  echo "      Server for the phone: $SERVER_URL"
  HOSTPORT=$(echo "$SERVER_URL" | sed -E 's#^https?://([^/]+).*#\1#')
  H=${HOSTPORT%%:*}; P=${HOSTPORT##*:}; [ "$P" = "$HOSTPORT" ] && P=80
  if ! port_open "$H" "$P"; then
    echo "      [!] $H:$P is not reachable on the network. If the server runs on this Mac:"
    echo "          System Settings > Network > Firewall: allow incoming connections for 'node'."
  fi
else
  echo "      [!] Could not find this Mac's Wi-Fi IP. Is the Mac connected to Wi-Fi?"
fi
"$ADB" logcat -c >/dev/null 2>&1 || true
START_OUT=$("$ADB" shell am start -W -n com.moneymobile.installment/.ui.EnrollmentActivity \
  --es action "REGISTER_DEVICE" --es shop_id "$SHOP_ID" --es enroll_secret "$SHOP_SECRET" \
  ${SERVER_URL:+--es server_url "$SERVER_URL"} 2>&1 | tr -d '\r')
if echo "$START_OUT" | grep -qi "error"; then
  echo "[ERROR] Could not open the MoneyMobile app on the phone:"
  echo "$START_OUT"
  read -n 1 -s -r -p "Press any key to close."; exit 1
fi

# The app saves the shop details immediately and reports the result in the log (tag MMEnroll).
RESULT=""
SAID_WAITING=0
for i in $(seq 1 25); do
  LOG=$("$ADB" logcat -d -s MMEnroll:I MMEnroll:W 2>/dev/null | tr -d '\r')
  if echo "$LOG" | grep -q "RESULT=OK"; then RESULT="OK"; break; fi
  if echo "$LOG" | grep -q "RESULT=FAIL"; then RESULT="FAIL"; break; fi
  if echo "$LOG" | grep -q "RESULT=NETWORK" && [ $SAID_WAITING -eq 0 ]; then
    echo "      Phone can't reach the server yet — it keeps retrying, waiting..."
    SAID_WAITING=1
  fi
  sleep 2
done

echo ""
echo " ====================================================="
if [ "$RESULT" = "OK" ]; then
  echo "   DONE — $BRAND $MODEL is registered to your shop."
  echo "   Find it by its IMEI on the website and assign it to"
  echo "   a customer. You can unplug the phone now."
elif [ "$RESULT" = "FAIL" ]; then
  echo "   [ERROR] The server refused the registration:"
  echo "$LOG" | grep -o "RESULT=FAIL.*" | tail -1 | sed 's/RESULT=FAIL /   /'
  echo "   Download a fresh config.txt from the website"
  echo "   (Settings > Device setup) and run this again."
else
  echo "   ALMOST DONE — the app is installed and the shop ID is"
  echo "   SAVED on the phone, but it can't reach the server yet."
  LASTERR=$(echo "$LOG" | grep -o "RESULT=NETWORK.*" | tail -1 | sed 's/RESULT=NETWORK //')
  [ -n "$LASTERR" ] && echo "   Phone says: $LASTERR"
  echo "   Connect the phone to the same Wi-Fi as the server and"
  echo "   make sure the server is running. The phone registers"
  echo "   by itself — no need to type anything or run this again."
fi
echo " ====================================================="
echo ""
read -n 1 -s -r -p "Press any key to close."
