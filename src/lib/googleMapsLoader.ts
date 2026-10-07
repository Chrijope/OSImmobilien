/**
 * Single-shot loader for the Google Maps JavaScript API.
 * Re-uses the in-flight promise so multiple components don't trigger duplicate script tags.
 */
let loaderPromise: Promise<any> | null = null;

export function loadGoogleMapsJs(libraries: string[] = []): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if ((window as any).google?.maps) return Promise.resolve((window as any).google);
  if (loaderPromise) return loaderPromise;

  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
  if (!key) return Promise.reject(new Error("Google Maps Browser-Key fehlt"));

  loaderPromise = new Promise((resolve, reject) => {
    const cbName = `__gmaps_cb_${Math.random().toString(36).slice(2)}`;
    (window as any)[cbName] = () => {
      delete (window as any)[cbName];
      resolve((window as any).google);
    };
    const params = new URLSearchParams({
      key,
      loading: "async",
      callback: cbName,
      v: "weekly",
    });
    if (channel) params.set("channel", String(channel));
    if (libraries.length) params.set("libraries", libraries.join(","));
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      loaderPromise = null;
      reject(new Error("Google Maps konnte nicht geladen werden"));
    };
    document.head.appendChild(script);
  });

  return loaderPromise;
}