import { istGueltigePixelId } from "./meta-capi.ts";
export async function pruefeMetaVerbindung(pixelId: string, token: string, fetchFn = fetch) {
  if (!istGueltigePixelId(pixelId)) return { ok: false, fehler: "Bitte zuerst eine gültige Pixel-ID speichern." };
  if (!token.trim()) return { ok: false, fehler: "Bitte zuerst ein Conversion-API-Token hinterlegen." };
  try {
    // Read-only: never sends a conversion or a test event. Token is not in the URL.
    const res = await fetchFn(`https://graph.facebook.com/v21.0/${pixelId}?fields=id`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
    });
    const json = await res.json();
    if (res.ok && json.id === pixelId) return { ok: true };
    if (json.error?.code === 190) return { ok: false, fehler: "Das Token ist ungültig oder abgelaufen. Bitte in Meta ein neues Token erstellen." };
    return { ok: false, fehler: "Zugriff auf diese Pixel-ID konnte nicht bestätigt werden. Prüfe Pixel-ID und Token-Zuordnung in Meta. Reine Versand-Tokens können ohne Leserecht hier nicht geprüft werden." };
  } catch { return { ok: false, fehler: "Meta ist gerade nicht erreichbar. Bitte später erneut prüfen." }; }
}
