import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import NyagoCargoPortal from './NyagoCargoPortal.jsx';
import './index.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

function PushNotificationSetup() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !supabase) return undefined;

    let active = true;
    let registrationListener;
    let errorListener;

    const registerForPush = async (userId) => {
      if (!active || !userId) return;
      try {
        let permission = await PushNotifications.checkPermissions();
        if (permission.receive !== 'granted') {
          permission = await PushNotifications.requestPermissions();
        }
        if (!active || permission.receive !== 'granted') return;
        await PushNotifications.register();
      } catch (error) {
        console.error('Push notification registration failed:', error);
      }
    };

    const start = async () => {
      registrationListener = await PushNotifications.addListener('registration', async (token) => {
        if (!active || !token?.value) return;
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) return;
        const { error } = await supabase.from('push_notification_tokens').upsert({
          user_id: user.id,
          token: token.value,
          platform: 'android',
          app_role: 'customer',
          updated_at: new Date().toISOString()
        }, { onConflict: 'token' });
        if (error) console.error('Could not save push notification token:', error.message);
      });

      errorListener = await PushNotifications.addListener('registrationError', (error) => {
        console.error('Native push notification registration error:', error);
      });

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) await registerForPush(session.user.id);

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user?.id) void registerForPush(session.user.id);
      });
      return () => subscription.unsubscribe();
    };

    let unsubscribeAuth;
    void start().then((cleanup) => { unsubscribeAuth = cleanup; }).catch((error) => {
      console.error('Could not initialize push notifications:', error);
    });

    return () => {
      active = false;
      unsubscribeAuth?.();
      registrationListener?.remove();
      errorListener?.remove();
    };
  }, []);

  return null;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <>
      <PushNotificationSetup />
      <NyagoCargoPortal />
    </>
  </React.StrictMode>
);
