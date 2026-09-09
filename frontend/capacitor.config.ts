import type { CapacitorConfig } from '@capacitor/cli';

// Native shell for the Hotshot app. The React build is bundled into the app.
// When the pilot server is live, set server.url to the HTTPS origin and the
// shell will load the site instead, so fixes ship without an App Store review.
const config: CapacitorConfig = {
  appId: 'com.nbtechai.hotshot',
  appName: 'Hotshot',
  webDir: 'build',
  ios: {
    contentInset: 'never',
    backgroundColor: '#0b0f14',
    scheme: 'Hotshot',
  },
  server: {
    // url: 'https://hotshot.nbtechai.com',
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: { launchShowDuration: 0, backgroundColor: '#0b0f14' },
    StatusBar: { style: 'DARK', backgroundColor: '#0b0f14' },
  },
};

export default config;
