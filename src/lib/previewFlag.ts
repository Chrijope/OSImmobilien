/**
 * Detects whether the app is running in the Lovable preview environment.
 * Used to automatically tag records created during testing.
 */
export function isPreviewEnv(): boolean {
  try {
    const host = window.location.hostname.toLowerCase();
    return (
      host.includes("-preview--") ||
      host.includes("localhost") ||
      host.endsWith(".lovableproject.com")
    );
  } catch {
    return false;
  }
}

/**
 * Merges a test flag into a JSONB meta object when running in the preview environment.
 * In production (live), the meta object is returned unchanged.
 * NOTE: Test data injection has been disabled per user request.
 */
export function withTestFlag(meta?: Record<string, unknown> | null): Record<string, unknown> {
  return { ...(meta ?? {}) };
}
