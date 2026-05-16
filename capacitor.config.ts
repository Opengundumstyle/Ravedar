import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ravematch.app',
  appName: 'Rave Match',
  webDir: 'out',
  ios: {
    scheme: 'Rave Match',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
