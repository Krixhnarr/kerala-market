# Android app (Trusted Web Activity)

The Play Store app is the website wrapped as a Trusted Web Activity with
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap): Chrome renders
`https://krixhnarr.github.io/kerala-market/` full-screen, and Android
verifies the app is allowed to do so via Digital Asset Links.

## Files (committed)

- `twa-manifest.json` – Bubblewrap's project definition (package id
  `io.github.krixhnarr.keralamarket`, colours, icons, start URL).
- `build-driver.mjs` – builds the app. Drives `@bubblewrap/core` directly
  instead of the `bubblewrap` CLI, whose interactive prompts don't work
  reliably over piped/non-TTY stdin on this machine; same library, no prompts.
- `site-root/.well-known/assetlinks.json` – the Digital Asset Links file.
  It must be served from the *origin root*,
  `https://krixhnarr.github.io/.well-known/assetlinks.json` (not under
  `/kerala-market/`), which is the `Krixhnarr/krixhnarr.github.io`
  repository. Without it the app still works but shows a browser bar.

## Not committed (git-ignored)

- `kerala-market.keystore` + `keystore-password.txt` – **the signing key.
  Back both up somewhere safe** (password manager, encrypted drive). Google
  Play ties the app to this key forever: lose it and you can never ship an
  update to the same listing. Regenerate with `keytool -genkeypair` if truly
  lost, but that means a new, unrelated Play listing.
- `app/`, `build.gradle`, `gradlew*`, `gradle/`, … – the generated Android
  project. Rebuilt from `twa-manifest.json` every run; nothing here is
  hand-edited, so nothing here is worth keeping in git.

## Build

Needs a JDK 17 and the Android SDK's `build-tools;36.1.0` (matches whatever
version `@bubblewrap/core` expects — check `BUILD_TOOLS_VERSION` in
`node_modules/@bubblewrap/core/dist/lib/androidSdk/AndroidSdkTools.js` if a
future Bubblewrap update bumps it).

```bash
cd android
npm install --no-save @bubblewrap/core   # first time only
set JAVA_HOME=C:\path\to\jdk-17
set ANDROID_HOME=C:\path\to\Android\Sdk
set BUBBLEWRAP_KEYSTORE_PASSWORD=<from keystore-password.txt>
set BUBBLEWRAP_KEY_PASSWORD=<same>
node build-driver.mjs
```

Produces `app-release-bundle.aab` (upload this to Play Console) and
`app-release-signed.apk` (install directly on a phone for testing, e.g.
`adb install app-release-signed.apk`).

## Releasing an update

1. Bump `appVersionCode` (+1) and `appVersionName` in `twa-manifest.json`.
2. Re-run the build, upload the new `.aab` to Play Console.

Site changes alone don't need a new app release — the app just shows the
live site. A new release is only needed for changes to this manifest
(name, icon, colours, package id) or to update the listing's version number.
