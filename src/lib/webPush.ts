import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = "BPhz2MPmqw8DQ7fQlPLh60BzlwTQms15UC1_ooMJnIGkB1iCPdZRYWvs8A1iziIk659fnUDcJE4iYn9cJapn9nM";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window;
}

export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  return navigator.serviceWorker.ready;
}

export async function requestPushPermission(): Promise<boolean> {
  if (!isPushSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function getPushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  const permissionGranted = await requestPushPermission();
  if (!permissionGranted) return null;

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
  } catch {
    return null;
  }

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    try {
      const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as any;
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
    } catch {
      return null;
    }
  }

  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) return subscription;

  const endpoint = subscription.endpoint;
  const p256dh = btoa(
    String.fromCharCode.apply(
      null,
      Array.from(new Uint8Array(subscription.getKey("p256dh")!))
    )
  );
  const auth = btoa(
    String.fromCharCode.apply(
      null,
      Array.from(new Uint8Array(subscription.getKey("auth")!))
    )
  );

  await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent.slice(0, 500),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

  return subscription;
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return true;

  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (user) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", subscription.endpoint);
  }

  await subscription.unsubscribe();
  return true;
}
