import { useCallback, useEffect, useState } from 'react';
import { pushApi } from '../api/admin.api.js';

// La llave pública VAPID viaja en base64url y el navegador la pide como bytes
const urlBase64ToUint8Array = (base64) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0)));
};

const supported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

// serviceWorker.ready nunca resuelve si no hay ninguno registrado, y en
// desarrollo no se registra: sin esto el botón se quedaría cargando para siempre.
const registrationOrNull = async () => {
  if (!(await navigator.serviceWorker.getRegistration())) return null;
  return navigator.serviceWorker.ready;
};

/**
 * Estados posibles:
 *   unsupported  el navegador no puede (iOS exige que el panel esté instalado)
 *   unavailable  el servidor no tiene llaves VAPID configuradas
 *   denied       el usuario bloqueó las notificaciones en el navegador
 *   off / on     se puede activar / ya está activa
 */
export function usePushNotifications() {
  const [state, setState] = useState(supported ? 'loading' : 'unsupported');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    (async () => {
      try {
        const { enabled } = await pushApi.config();
        if (cancelled) return;
        if (!enabled) return setState('unavailable');
        if (Notification.permission === 'denied') return setState('denied');
        const registration = await registrationOrNull();
        if (!registration) return setState('unavailable');
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setState(existing ? 'on' : 'off');
      } catch {
        if (!cancelled) setState('unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const { publicKey } = await pushApi.config();
      const registration = await registrationOrNull();
      if (!registration) throw new Error('El service worker no está registrado');
      // Reusa la suscripción si ya existe: volver a suscribir con otra llave falla
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        }));
      await pushApi.subscribe(subscription.toJSON());
      setState('on');
    } catch (err) {
      setError(err.message ?? 'No se pudieron activar las notificaciones');
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await registrationOrNull();
      const subscription = registration && (await registration.pushManager.getSubscription());
      if (subscription) {
        // Primero se da de baja en el servidor: si se desuscribe local y falla
        // el API, el endpoint queda huérfano recibiendo pushes para siempre.
        await pushApi.unsubscribe(subscription.endpoint).catch(() => {});
        await subscription.unsubscribe();
      }
      setState('off');
    } catch (err) {
      setError(err.message ?? 'No se pudieron desactivar');
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, error, busy, enable, disable };
}
