import type { CapacitorConfig } from "@capacitor/cli";
// App identity lives in app.config.json (one place; `pnpm brand` pushes it
// into the native projects). The CLI compiles this file to CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const app = require("./app.config.json") as { appId: string; appName: string; backgroundColor: string };

// Fully offline: webDir is the Studio build (scripts/build-web.mjs) bundled
// into the binary. There is deliberately no `server.url`.
const config: CapacitorConfig = {
  appId: app.appId,
  appName: app.appName,
  webDir: "www",
  backgroundColor: app.backgroundColor,
  // Default schemes: capacitor://localhost (iOS), https://localhost (Android).
  server: { androidScheme: "https" },
  ios: {
    contentInset: "never",
    allowsLinkPreview: false,
    scrollEnabled: false,
  },
  android: {
    // Export frames go to the native encoder over http://127.0.0.1 (see
    // MOBILE.md). Loopback is a trustworthy origin in Chromium; this
    // covers older WebViews that still treat it as mixed content.
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 600,
      backgroundColor: app.backgroundColor,
      showSpinner: false,
      androidScaleType: "CENTER",
      splashFullScreen: false,
      splashImmersive: false,
    },
  },
};

export default config;
