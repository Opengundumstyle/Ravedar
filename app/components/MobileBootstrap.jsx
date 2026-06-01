'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { supabase } from '../../lib/supabaseClient';

export default function MobileBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    SplashScreen.hide().catch(() => {});

    let subscription;
    const setup = async () => {
      subscription = await App.addListener('appUrlOpen', async ({ url }) => {
        try {
          // Implicit/fragment flow only: ravematch://oauth/callback#access_token=...&refresh_token=...
          // If Supabase auth is migrated to PKCE, this must parse `?code=` and call exchangeCodeForSession.
          const hashIndex = url.indexOf('#');
          if (hashIndex === -1) return;
          const params = new URLSearchParams(url.slice(hashIndex + 1));
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
          }
        } catch (err) {
          console.error('[MobileBootstrap] OAuth deep-link handling failed:', err);
        } finally {
          await Browser.close().catch(() => {});
        }
      });
    };
    setup();

    return () => {
      if (subscription) subscription.remove();
    };
  }, []);

  return null;
}
