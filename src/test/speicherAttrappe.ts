/**
 * Ein einfacher Browser-Speicher für Tests.
 *
 * In dieser Testumgebung ist `window.localStorage` nicht zuverlässig
 * vorhanden (Node meldet "localStorage is not available"). Wer Speicher
 * prüfen will, setzt ihn deshalb im `beforeEach` mit dieser Attrappe ein,
 * wie es gut dreißig Tests bisher jeweils von Hand tun.
 */
export function setzeSpeicherAttrappe(art: "localStorage" | "sessionStorage" = "localStorage"): Map<string, string> {
  const speicher = new Map<string, string>();
  Object.defineProperty(window, art, {
    configurable: true,
    value: {
      getItem: (k: string) => (speicher.has(k) ? (speicher.get(k) as string) : null),
      setItem: (k: string, v: string) => {
        speicher.set(k, String(v));
      },
      removeItem: (k: string) => {
        speicher.delete(k);
      },
      clear: () => speicher.clear(),
      key: (i: number) => [...speicher.keys()][i] ?? null,
      get length() {
        return speicher.size;
      },
    },
  });
  return speicher;
}
