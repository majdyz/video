# deepfix mobile (iOS + Android)

Capacitor 8 shell around the Studio web app (`apps/studio`). The web code is
the product; the native side adds what a browser can't do well: original files
from Photos, a hardware encoder fed directly by the renderer, saving to the
gallery, the share sheet, and exports that survive leaving the app.

Status (25 Oct 2026): projects generated, plugin implemented on both platforms,
CI workflow written. Nothing has run on a device yet; the first CI run is the
first compile of the Swift and Android code.

## Layout

```
apps/mobile/
├── app.config.json          app id, name, version, build number: the one place to rename the app
├── capacitor.config.ts      reads app.config.json; webDir www, no server.url (fully offline)
├── scripts/
│   ├── build-web.mjs        Studio → www/ (relative base, no service worker, no manifest)
│   ├── native-assets.mjs    icons + splash screens from apps/studio/public/icon.svg
│   └── apply-brand.mjs      app.config.json → iOS project/Info.plist (`--check` in CI)
├── ios/
│   ├── App/                 Xcode project (SPM, no CocoaPods); App/ holds the plugin:
│   │   ├── DiveBridgeViewController.swift   registers the local plugin
│   │   ├── DiveNativePlugin.swift           bridge methods
│   │   ├── BackgroundExport.swift           BGContinuedProcessingTask / background task
│   │   └── MediaImport.swift                PHPicker, document picker, save to Photos
│   └── DiveExport/          Swift package, no Capacitor: loopback HTTP endpoint,
│                            AVAssetWriter encoder + audio passthrough, pixel copy, tests
└── android/                 Gradle project; app/src/main/java/app/deepfix/dive/export/:
    DiveNativePlugin.java, ExportHub.java, LoopbackServer.java, Http.java,
    FrameEncoder.java (MediaCodec + MediaMuxer), EglFrameRenderer.java,
    ExportService.java (foreground service), GallerySaver.java
```

Generated and git-ignored (as Capacitor recommends): `www/`, the copied web
assets (`ios/App/App/public`, `android/app/src/main/assets/public`),
`capacitor.config.json`, `config.xml`, the Cordova plugin folders. Run
`cap sync` after cloning.

## Commands

```bash
pnpm install
pnpm --filter mobile sync          # build the Studio into www/ and cap sync both platforms
pnpm --filter mobile assets        # regenerate icons / splash after changing icon.svg
pnpm --filter mobile brand         # after editing app.config.json
pnpm --filter mobile open:ios      # Xcode (Mac), or open:android (Android Studio)
```

The web deploy is untouched: root `pnpm build` / `pnpm deploy` still produce
`/video/studio/` etc. The only Studio changes are additive (the native bridge
is a lazy chunk loaded only when `window.Capacitor` exists).

## What the shell changes in the Studio

| Concern | Web (unchanged) | In the app |
|---|---|---|
| Base URL | `/video/studio/` | `./` from `capacitor://localhost` (iOS) / `https://localhost` (Android) |
| Offline | service worker precache | bundle ships in the binary; SW not registered |
| Opening clips | `<input type=file>` | `DiveNative.pickMedia`: PHPicker with `.current` representation (the original HEVC .mov, telemetry tracks intact, no transcode) or Files; Android Photo Picker / document picker. The pick is copied into the app's caches folder and handed to the page as a `File` |
| Export | WebCodecs offline, or WebKit real-time recorder | `exportMode: "native"`: decode + render in the page, encode natively |
| Save / share | download link, Web Share | Save to Photos / gallery, system share sheet (`@capacitor/share`) |
| Background | export pauses | iOS continued-processing task / Android foreground service |

`?native=0` keeps the web export paths inside the app (for A/B timing).

## Native export

The weak point of the web build on iPhones is getting rendered frames into an
encoder: on WebKit each canvas → `VideoFrame` copy costs 60–80 ms, which is why
the web app falls back to recording the canvas in real time. In the app the
page still decodes (WebCodecs via mediabunny) and renders (the same WebGPU /
WebGL2 graph as the web export), but the encoder is the platform's:

```
 page (WKWebView / Android WebView)                     app process
 ───────────────────────────────────                    ─────────────────────────────────────────
 mediabunny decode ─▶ geometry + colour render                    
   ─▶ VideoFrame (engine readback path: CPU RGBX/BGRX)            
   ─▶ copyTo(Uint8Array)  ──POST /export/<id>/frame──▶  ExportHub (127.0.0.1, random port, token)
        one request in flight, response = backpressure     │
                                                           ├─ iOS: CVPixelBuffer (vImage swizzle) ─▶ AVAssetWriter (H.264/HEVC, HW)
                                                           └─ Android: GL texture ─▶ MediaCodec input Surface (GPU RGB→YUV) ─▶ MediaMuxer
                                                         audio: source file ─▶ AVAssetReader passthrough / MediaExtractor packets (no re-encode)
 DiveNative.startExport / finishExport / cancelExport (Capacitor bridge, JSON only)
```

Why a loopback socket: the Capacitor bridge is JSON; a 4K RGBA frame is 33 MB,
base64 in a string, several copies per frame. A `fetch` with an ArrayBuffer
body moves it once. The endpoint binds 127.0.0.1 only, every route checks a
per-launch random token, CORS is open so the page can read responses, and the
requests are CORS "simple" (text/plain) so there is no preflight per frame.
iOS needs `NSAllowsLocalNetworking`; Android has a network-security config that
allows cleartext to 127.0.0.1 only.

Checked on this devbox (headless browsers, the Java endpoint running on the
JVM): from an `https://localhost` page (Android's origin) Chromium posts to
`http://127.0.0.1` without a mixed-content block and CORS passes. Chromium
uploads a `Blob` body about 10× faster than an `ArrayBuffer` body (8 MB: 160 ms
vs 1.6 s on this loaded VM, same with a Node server), so the sink wraps each
frame in a Blob. Desktop WebKit **blocks** `http://127.0.0.1` from an `https`
page as mixed content; iOS pages are `capacitor://localhost`, not https, and
whether WKWebView applies the same block there is the first thing to check on
a device. The page probes `GET /ping` before an export (`loopbackReachable`)
and falls back to sending frames over the bridge (`DiveNative.appendFrame`,
base64: several times slower, but it works) and small files via
`DiveNative.writeFile`. If iOS does block it, plan B is a
`WKURLSchemeHandler` for a private scheme registered in
`DiveBridgeViewController.webViewConfiguration(for:)`, which receives the POST
body without a socket.

Plugin contract (TypeScript, single source): `apps/studio/src/native/plugin.ts`.
Web side: `apps/studio/src/native/bridge.ts` (`NativeFrameSink`,
`pickNativeFile`, save/share) and `Studio.runNative` in
`apps/studio/src/pipeline/studio.ts`.

Frame POST: `POST /export/<id>/frame?token=&seq=&pts=&dur=&fmt=&w=&h=`, body =
`w*h*4` bytes, tightly packed rows, top row first, `fmt` one of RGBA / RGBX /
BGRA / BGRX (whatever the `VideoFrame` already is, so the copy is a memcpy for
the engine's readback frames; other formats go through `copyTo({format:
"RGBA"})` or a 2D canvas). `pts` in µs relative to the first frame; `seq` must
be consecutive (409 otherwise). The audio is aligned with `audio.shiftSec` =
source time of the first video frame (iOS starts the writer session there, so
priming before it is trimmed by the edit list; Android drops packets before it).
Odd sizes are rounded down to even (4:2:0).

Implemented vs stubbed:

| Part | iOS | Android |
|---|---|---|
| Loopback endpoint | done (Network.framework), unit-tested | done (ServerSocket), JVM-tested, and posted to from headless Chromium on an https://localhost page |
| Bridge fallback (frames, files) | done (`appendFrame`, `writeFile`) | done |
| Encoder | done: AVAssetWriter + pixel buffer pool, BT.709 tags, H.264 High / HEVC, keyframe interval, unit-tested (encode + audio passthrough + file checks) | done: MediaCodec Surface input via EGL (`EGL_RECORDABLE_ANDROID`, `eglPresentationTimeANDROID`), MediaMuxer; compile-checked only |
| Audio passthrough | done (AAC etc. passthrough, LPCM → AAC) | done (AAC / AMR packets copied; other codecs dropped and reported) |
| Picker | done (PHPicker `.current`, UIDocumentPicker) | done (Photo Picker / ACTION_OPEN_DOCUMENT, copy to cache) |
| Save to gallery | done (PHPhotoLibrary add-only) | done (MediaStore `Movies/<app>`, legacy path ≤ Android 9) |
| Share | `@capacitor/share` | `@capacitor/share` (FileProvider from the template) |
| Background | BGContinuedProcessingTask skeleton wired to progress + expiry (see below) | foreground service with progress notification + Cancel, wired |

Next steps, in order of expected gain:

1. Measure on devices (frames/s at 1080p and 4K, per stage) before optimising.
2. Pack to NV12 on the GPU before readback (one extra pass in the engine:
   12 bits/pixel instead of 32, 2.7× fewer bytes to read back and post) and
   accept NV12 natively (iOS `420YpCbCr8BiPlanarVideoRange` buffers directly;
   Android: two textures, Y + UV, in the same EGL path).
3. Stream the picked clip instead of reading it into a `Blob` (see Risks).
4. Long term: a native renderer for export (Metal / Vulkan port of the grade
   shader, which already has WGSL and GLSL versions) so export needs no
   WebView at all — the only way to make background export on iOS reliable.

## Background processing

**iOS 26+: `BGContinuedProcessingTask`** (verified against Apple's
BackgroundTasks documentation, "Performing long-running tasks on iOS and
iPadOS", and WWDC25 session 227):

* The request (`BGContinuedProcessingTaskRequest(identifier:title:subtitle:)`)
  must be submitted from the foreground in response to a user action; it is
  submitted in `startExport`, which runs right after the Export tap.
* Identifier `<bundle id>.export.<export id>`, matched by the wildcard
  `app.deepfix.dive.export.*` in `BGTaskSchedulerPermittedIdentifiers`
  (wildcards are allowed for continued-processing tasks, and their handlers
  are registered dynamically right before submit — once per identifier; a
  second registration of the same identifier crashes the app, hence one id per
  export).
* `strategy = .fail` (start now or not at all), `requiredResources = .gpu`
  when `BGTaskScheduler.supportedResources` contains it; that needs the
  `com.apple.developer.background-tasks.continued-processing.gpu` entitlement
  (`App.entitlements`, capability "Background GPU Access"). Without GPU
  support the request is resubmitted without it.
* Progress: `task.progress` (1000 units) from the encoder's frame timestamps,
  `updateTitle(_:subtitle:)` once a second. The system shows it in a Live
  Activity; the user can stop it there, which calls the expiration handler →
  `exportState: background-expired` → the page cancels.
* Older iOS: `beginBackgroundTask` (about 30 s).
* `UIBackgroundModes: processing` is declared as well; drop it if App Review
  objects and the continued task still submits without it.

**The catch:** the rendering happens in WebKit's web content and GPU
processes, not in the app process the task (and its GPU grant) belongs to.
WebKit suspends a hidden page's process; whether a continued-processing task
keeps it running is not documented and needs a device test. The plugin is
written so the export *pauses* rather than fails: frames stop arriving, the
encoder waits, the Live Activity stays, and the page resumes posting when the
app returns (`paused` / `resumed` events). If the device test shows WebKit is
suspended, background export on iOS needs the native renderer (next step 4).

**Android: foreground service** (`ExportService`): started with the export,
type `mediaProcessing` on Android 15+ (6 h per 24 h budget, `onTimeout` →
`background-expired`) and `dataSync` on Android 14; ongoing notification with
progress and a Cancel action (→ `cancelled-by-user`). The WebView renderer's
priority is pinned (`setRendererPriorityPolicy(IMPORTANT, false)`) so it is not
killed while hidden. Capacitor doesn't pause the WebView on `onPause`, so the
decode/render loop keeps running; Chromium may still throttle a hidden page.
`POST_NOTIFICATIONS` is requested (not awaited) on Android 13+.

## WebGPU / WebCodecs in the WebViews

| | iOS 26 WKWebView | Android System WebView |
|---|---|---|
| WebGPU | Shipped in Safari 26 on iOS/iPadOS (WebKit blog, WWDC25). The announcement does not mention WKWebView explicitly; WebKit features normally apply to WKWebView, so expect it, but check `navigator.gpu` on a device. The engine falls back to WebGL2 by itself. | Chrome for Android has it since 121 (Android 12+, Qualcomm/ARM GPUs); no WebView shipping milestone is listed on chromestatus. Assume WebGL2 (the engine's fallback, fully supported). |
| WebCodecs video | VideoDecoder/VideoEncoder since Safari 16.4 | since Chrome 94, WebView included |
| WebCodecs audio | AudioEncoder/AudioDecoder new in Safari 26 | yes |
| MediaRecorder (real-time path) | yes | yes |

The About sheet / console logs show which backend runs (`[export]` lines name
the mode). The native export only needs `VideoDecoder` in the page.

## CI (`.github/workflows/mobile.yml`)

Triggers: push to branch `mobile`, pull requests touching the app or its
sources, manual dispatch. To run it: `git push origin HEAD:mobile`.

* `web` (ubuntu): Studio unit tests, `apply-brand.mjs --check`, `build:web`,
  uploads `www`.
* `android` (ubuntu, JDK 21, Gradle cache): `cap sync android`,
  `./gradlew testDebugUnitTest assembleDebug`, uploads
  `deepfix-android-debug` (installable APK, debug-signed).
* `ios` (macos-15, newest Xcode 26 on the image, SPM cache): `cap sync ios`,
  `xcodebuild test` of the DiveExport package on an iPhone simulator, unsigned
  simulator build of the app (`CODE_SIGNING_ALLOWED=NO`), uploads
  `deepfix-ios-simulator` (App.app zipped: `xcrun simctl install booted App.app`).

## Before TestFlight / Play internal testing (nothing created yet)

### Apple

1. **Apple Developer Program** membership, USD 99/year. Individual (your name
   shows as the seller) or Organization (needs a D-U-N-S number).
2. **App ID** (Certificates, Identifiers & Profiles) for the final bundle id
   (placeholder `app.deepfix.dive`; it can't be changed once the app is
   created in App Store Connect) with the **Background GPU Access** capability
   enabled (for the continued-processing GPU entitlement).
3. **App Store Connect app record** (name, primary language, bundle id, SKU).
   For selling: the **Paid Apps agreement** with bank and tax forms. Colour as a
   paid unlock means **StoreKit in-app purchase** products (Apple requires IAP
   for unlocking app features) — a later code change.
4. **Signing for CI**, either
   * recommended: an **App Store Connect API key** (Users and Access →
     Integrations; role App Manager) and cloud-managed signing
     (`xcodebuild -allowProvisioningUpdates -authenticationKeyPath …`), which
     also uploads to TestFlight; or
   * manual: an **Apple Distribution certificate** (.p12 + password) and an
     **App Store provisioning profile** for the App ID.
5. **GitHub secrets** (repo → Settings → Secrets and variables → Actions):
   `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`;
   for manual signing additionally `IOS_DIST_CERT_P12_BASE64`,
   `IOS_DIST_CERT_PASSWORD`, `IOS_PROFILE_BASE64`, `KEYCHAIN_PASSWORD`.
6. Store paperwork for TestFlight external testers (Beta App Review) and
   later release: privacy policy URL, App Privacy answers ("Data not
   collected" fits: nothing leaves the device), export compliance is
   pre-answered (`ITSAppUsesNonExemptEncryption = NO`), a
   `PrivacyInfo.xcprivacy` for the app target (Capacitor ships its own).
   Internal testers (up to 100 App Store Connect users) need no review.

### Google

1. **Google Play Console** developer account, USD 25 once, identity
   verification. Personal accounts created after Nov 2023 must run a
   **closed test with at least 12 testers for 14 days** before production;
   internal testing (up to 100 testers) is available immediately.
2. **App in Play Console** with the final package name (placeholder
   `app.deepfix.dive`, permanent once uploaded). Enrol in **Play App Signing**
   (Google keeps the app signing key).
3. **Upload key**: `keytool -genkeypair -v -keystore upload.jks -alias upload
   -keyalg RSA -keysize 2048 -validity 10000`. Keep it outside the repo.
4. **GitHub secrets**: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` (`app/build.gradle` signs
   release builds when `ANDROID_KEYSTORE_PATH` etc. are set: decode the
   keystore to a file in the job), and for automated uploads
   `PLAY_SERVICE_ACCOUNT_JSON` (Google Cloud service account invited in Play
   Console → Users and permissions with release-to-testing rights). The first
   AAB (`./gradlew bundleRelease`) must be uploaded by hand in the console.
5. Console declarations: **foreground service types** (mediaProcessing /
   dataSync: Play asks for a description and a short video of the feature),
   Data safety (no data collected), privacy policy URL, content rating, target
   audience. The app uses the Photo Picker and requests no photo/video read
   permissions, which keeps it out of Play's media-permission policy.
   Colour as a paid unlock means **Play Billing** products (later).

## Risks and open questions

* **Throughput unknown.** 4K RGBA at 30 fps is ~1 GB/s through readback, a JS
  copy and a loopback socket; expect a few fps at 4K and much better at 1080p
  until the NV12 packing lands. Measure first.
* **WKWebView mixed content**: if `capacitor://localhost` → `http://127.0.0.1`
  is blocked on iOS, exports run over the slow bridge fallback until the
  scheme-handler transport (plan B above) is written.
* **iOS background export** may not work while WebKit suspends the page (see
  above). The task, Live Activity and pause/resume path are in place; the fix
  if needed is the native renderer.
* **Picked files are read into a Blob** so the existing Studio code (which
  takes a `File`) works unchanged. On iOS the WebView may keep a multi-GB clip
  in memory. Follow-up: give the Studio a URL source (`<video src>` = the
  sandbox URL, mediabunny `UrlSource` with range requests; Capacitor's asset
  handlers serve ranges).
* Untested on hardware: Android MediaCodec/EGL path (compile-checked against
  android.jar only), the iOS app target (CI compiles it), BG task submission
  (needs a device on iOS 26), Android encoder limits above 4K (5.3K GoPro will
  be rejected by most phone encoders: the error says so).
* 8-bit SDR output (BT.709) like the web export; HDR / 10-bit sources are
  tone-mapped by the browser's decode.
* `CapApp-SPM/Package.swift` and `android/capacitor.settings.gradle` contain
  pnpm store paths; `cap sync` regenerates them in CI, but bumping a Capacitor
  version means re-running `cap sync` and committing the result.
