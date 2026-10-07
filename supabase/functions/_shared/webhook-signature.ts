/**
 * HMAC-SHA256 Webhook-Signaturverifikation mit Anti-Replay (Timestamp ±5min).
 *
 * Erwartete Header (case-insensitive):
 *   x-webhook-timestamp : Unix-Sekunden
 *   x-webhook-signature : "sha256=<hex>"  über `${timestamp}.${rawBody}`
 */
export async function verifyHmacSignature(
  req: Request,
  rawBody: string,
  secret: string,
  opts: { toleranceSeconds?: number } = {},
): Promise<{ valid: boolean; reason?: string }> {
  const tolerance = opts.toleranceSeconds ?? 300;
  const ts = req.headers.get("x-webhook-timestamp");
  const sigHeader = req.headers.get("x-webhook-signature");
  if (!ts || !sigHeader) return { valid: false, reason: "missing_headers" };

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return { valid: false, reason: "bad_timestamp" };
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > tolerance) {
    return { valid: false, reason: "expired" };
  }

  const provided = sigHeader.replace(/^sha256=/i, "").trim().toLowerCase();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const macBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${ts}.${rawBody}`),
  );
  const expected = Array.from(new Uint8Array(macBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time vergleich
  if (provided.length !== expected.length) return { valid: false, reason: "length_mismatch" };
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0 ? { valid: true } : { valid: false, reason: "mismatch" };
}