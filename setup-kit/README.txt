MoneyMobile — Install the app on a phone
=========================================

ONE FILE FOR EVERY PHONE
  Mac:     setup-mac.command   (first time: right-click > Open > Open, afterwards double-click)
  Windows: setup-windows.bat   (if "Windows protected your PC" appears: More info > Run anyway)

  - New or factory-reset phone  -> installs the app, turns on full management, registers it to your shop.
  - Phone that's already set up -> only updates the app. Customer and lock status stay the same.

NEW / FACTORY-RESET PHONE — on the phone first
  1. Finish the welcome screens. Do NOT add a Google or Samsung account yet.
  2. Connect to Wi-Fi (any internet). Settings > Accounts must be EMPTY (skip every account).
  3. Turn on Developer options (tap "Build number" 7 times; Xiaomi: "OS version"), then in
     Developer options turn ON "USB debugging" and "Stay awake". Brand steps: website > Install App.
  4. Put the customer's SIM in (this becomes the approved SIM).
  Xiaomi / Redmi / Poco only (one time, before running the setup file):
     a) Developer options > turn ON "USB debugging (Security settings)". Xiaomi asks you to sign in
        to a Mi account to switch it on - sign in, switch it on, then SIGN OUT again
        (Settings > Xiaomi account > Sign out, let it turn off Find device). Accounts must be empty.
     b) You do NOT need "Install via USB". If the setup file says "ON THE PHONE: tap INSTALL",
        tap Install on the phone (or File Manager > Downloads > MoneyMobile.apk > Install).
     c) Developer options > "Stay awake" ON, and keep the phone unlocked during setup.

THEN
  Plug the phone straight into the computer, choose "File transfer", tap "Allow" on the phone,
  run the setup file, keep the phone unlocked and wait for DONE. If the phone's IMEI is already on
  a customer, it links to that customer by itself; otherwise find it by its IMEI and assign it.
  QR code setup is currently blocked by Google for MoneyMobile - always use this setup file.

AFTER SETUP
  - Overdue payments (app v1.6.0 and newer): the phone locks itself when the due date + grace days
    have passed, even with no internet or in airplane mode. It also shows a reminder 2 days and
    1 day before ("Your phone will lock on ..."), and the app shows the lock date. The phone needs
    to have been online once since the due date was set or changed.
  - Locked phone with no internet: website > customer > "30-min unlock code".
    The customer taps "Enter unlock code" on the phone. Works without Wi-Fi or SIM.
  - Play Store: once unlocked, Settings > Accounts > Add account > Google.

Keep this folder private: config.txt lets anyone register phones to your shop.
