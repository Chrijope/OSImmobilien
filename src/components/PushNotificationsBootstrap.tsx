import { useEffect } from "react";
import { useUser } from "@/contexts/UserContext";
import { isPushSupported, getPushPermission, subscribeToPush } from "@/lib/webPush";

/**
 * Mounts once inside the authenticated app shell.
 * - If the user has already granted notification permission, we (re)subscribe silently
 *   so a fresh device/PWA install gets registered.
 * - We never auto-prompt here; the prompt is triggered explicitly from the settings UI.
 */
export function PushNotificationsBootstrap() {
  const { user } = useUser();

  useEffect(() => {
    if (!user?.moreId) return;
    if (!isPushSupported()) return;
    if (getPushPermission() !== "granted") return;
    subscribeToPush().catch(() => {});
  }, [user?.moreId]);

  return null;
}