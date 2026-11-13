# Android

A Trusted Web Activity wraps the phone page (package `dev.example.nod`, launcher name "Nod") and shows Web Push notifications.

**Build.** `pnpm android:build` needs JDK 17 (`.mise.toml` pins it; run `mise install`), the Android SDK and a running tailnet. It reads the tailnet host from `tailscale status --json` and writes a gitignored `android/twa-manifest.json`.

- It creates the signing key `~/.config/nod/android.keystore` on first use, with a random password in `~/.config/nod/android-keystore.pass` (mode 600). Neither file is committed or printed.
- Bubblewrap then generates the project in `android/` and builds a signed APK to `release/android/nod.apk`.
- Each build bumps the version code, counted in `~/.config/nod/android-version.txt`, and bakes it into the start URL as `/?apk=<versionCode>`.
- The build publishes the APK and `latest.json` (`{versionCode, versionName, sha256, builtAt}`) to `~/.local/state/nod/android/`. The server reads them from there and never serves from the repo.
- The certificate fingerprint goes to `~/.config/nod/android-fingerprint.txt`. The server reads it at start and serves `/.well-known/assetlinks.json`, so restart the service after the first build.

**Install.** Turn on USB debugging on the phone and run `pnpm android:install` (`adb install -r`). Or copy `release/android/nod.apk` to the phone and open it.

**Updates without USB.** The phone page remembers the version from its start URL (localStorage, with a `nod_apk` cookie as fallback) and checks `GET /api/android/latest` on launch. When the published version is newer, it shows "App update available" with an Install button. The button downloads `GET /api/android/nod.apk`, and Android then asks to install it.

- The first time, Android asks to allow installs from Nod or Chrome.
- Dismissing hides the banner until the next version.
- Both endpoints need a device key, like every tailnet request.
- An app built before this change opens `/` without the version, so install the first new APK over USB.
- The query does not affect Digital Asset Links (it verifies the origin) or the pairing links, which open their own URL.

**First launch.** The app opens the phone page without a browser bar once Digital Asset Links verifies. It starts unpaired. Open Settings > Pair phone in the desktop app and scan the QR code with the phone camera. The link opens in the app and pairs it.

- The generated manifest claims every `https://<tailnet host>` URL with `android:autoVerify="true"`.
- Android checks `/.well-known/assetlinks.json` on port 443 when the app is installed or updated. The APK must be installed after Tailscale Serve answers on 443. A failed check is not retried until the next install.

**Notifications.** In the app, open the menu (three dots) and turn on "Notifications on this phone". The phone asks for permission, subscribes, and sends the subscription to the server, which stores it with the device.

- The server sends Web Push for the same triggers as the desktop. See [Notifications](notifications.md).
- The payload holds only the title, body and target. Tapping it opens that PR or issue.
- VAPID keys are generated once into `~/.local/state/nod/vapid.json` (mode 600).
- Revoking a phone deletes its subscription.

See [Phone](phone.md) for pairing and updates.
