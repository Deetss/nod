# Android

A Trusted Web Activity wraps the phone page (package from `android.packageId` in settings, `io.github.reviewinbox` by default, launcher name "Nod") and shows Web Push notifications.

**One APK for every server.** No host is built in. On first launch the app shows a setup screen: scan the pair QR, paste the pair link, or type the desktop's tailnet name. It checks `GET https://<host>/api/health` answers `app: "nod"`, stores the host on the phone, then opens `https://<host>/?apk=<versionCode>`.

- A `nod://pair?host=<host>&code=<code>` link opens setup filled in, and after the check opens `/pair#code=<code>` to finish pairing. Scan and paste also accept the desktop's `https://<host>/pair#code=<code>` link.
- Long-press the launcher icon for Change server (or open `nod://server`) to point the app at another desktop.
- QR scanning uses ZXing (`zxing-android-embedded`), so it needs no Google Play Services.
- Debug builds may check `10.0.2.2` (the emulator's host) over http, for testing against `FIXTURES=1 pnpm start`. Release builds use https only.

The app is built for the package in `android.packageId` (Settings > Phone and push), so an APK matches the `assetlinks.json` the server serves.

**Build.** `android/` is a hand-kept Gradle project (a Bubblewrap scaffold, no longer regenerated). `pnpm android:build` needs JDK 17 (`.mise.toml` pins it; run `mise install`) and the Android SDK, and runs `./gradlew assembleRelease` with the same `-PnodPackage`, `-PnodVersionCode` and `-PnodVersionName` properties the release workflow passes.

- It creates the signing key `~/.config/nod/android.keystore` on first use, with a random password in `~/.config/nod/android-keystore.pass` (mode 600). Neither file is committed or printed; Gradle reads them from `NOD_KEYSTORE` and `NOD_KEYSTORE_PASSWORD`.
- The signed APK goes to `release/android/nod.apk`.
- Each build bumps the version code, counted in `~/.config/nod/android-version.txt`. The app sends it as `/?apk=<versionCode>`.
- The build publishes the APK and `latest.json` (`{versionCode, versionName, sha256, builtAt}`) to `~/.local/state/nod/android/`. The server reads them from there and never serves from the repo.
- The certificate fingerprint goes to `~/.config/nod/android-fingerprint.txt`. The server reads it at start and serves `/.well-known/assetlinks.json`, so restart the service after the first build.

**Install.** Turn on USB debugging on the phone and run `pnpm android:install` (`adb install -r`). Or copy `release/android/nod.apk` to the phone and open it. See [Phone](phone.md) for pairing, updates and the service.

**Updates without USB.** The phone page remembers the version from its start URL (localStorage, with a `nod_apk` cookie as fallback) and checks `GET /api/android/latest` on launch. When the published version is newer, it shows "App update available" with an Install button. The button downloads `GET /api/android/nod.apk`, and Android then asks to install it.

- The first time, Android asks to allow installs from Nod or Chrome.
- Dismissing hides the banner until the next version.
- Both endpoints need a device key, like every tailnet request.
- An app built before this change opens `/` without the version, so install the first new APK over USB.
- The query does not affect Digital Asset Links (it verifies the origin) or the pairing links, which open their own URL.

**Browser bar.** The app opens the phone page without a browser bar once Chrome verifies Digital Asset Links for the stored host. The app no longer claims `https` links, so the phone camera opens a scanned pair link in Chrome; scan it from the app's setup screen instead.

- `assetlinks.json` lists the package the published APK was built as (`packageId` in `latest.json`), then settings `android.packageId`. If the app still shows a browser bar, compare `curl https://<tailnet host>/.well-known/assetlinks.json` with the APK's package (`aapt2 dump packagename nod.apk`).

**Notifications.** In the app, open the menu (three dots) and turn on "Notifications on this phone". The phone asks for permission, subscribes, and sends the subscription to the server, which stores it with the device.

- The server sends Web Push for the same triggers as the desktop. See [Notifications](notifications.md).
- The payload holds only the title, body and target. Tapping it opens that PR or issue.
- VAPID keys are generated once into `~/.local/state/nod/vapid.json` (mode 600).
- Revoking a phone deletes its subscription.
