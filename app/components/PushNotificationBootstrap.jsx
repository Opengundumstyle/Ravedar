'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '../../lib/supabaseClient';

export default function PushNotificationBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let regSub;
    let errSub;

    const platform = Capacitor.getPlatform();
    if (platform !== 'ios' && platform !== 'android') return;

    (async () => {
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
        const r = await PushNotifications.requestPermissions();
        if (r.receive !== 'granted') return;
      } else if (perm.receive !== 'granted') {
        return;
      }

      regSub = await PushNotifications.addListener('registration', async (info) => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) return;
          await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-push-token`,
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ token: info.value, platform }),
            }
          );
        } catch (err) {
          console.error('[PushNotificationBootstrap] token register failed:', err);
        }
      });

      errSub = await PushNotifications.addListener('registrationError', (err) => {
        console.error('[PushNotificationBootstrap] registration error:', err);
      });

      await PushNotifications.register();
    })();

    return () => {
      if (regSub) regSub.remove();
      if (errSub) errSub.remove();
    };
  }, []);

  return null;
}
