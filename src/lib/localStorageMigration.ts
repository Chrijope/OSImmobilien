/**
 * One-time localStorage migration: hpo_ and herzogpark_ prefixed keys -> mi_
 * Runs once per browser; guarded by a sentinel flag.
 */
const MIGRATION_FLAG = "mi_ls_migration_v1_done";

export function runLocalStorageMigration() {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(MIGRATION_FLAG) === "1") return;

    const renameMap: Array<[RegExp, (s: string) => string]> = [
      [/^hpo_/, (k) => "mi_" + k.slice(4)],
      [/^herzogpark_/, (k) => "mi_" + k.slice(11)],
      [/^hpo-objekt-drafts$/, () => "mi-objekt-drafts"],
      [/^hpo-bell-/, (k) => "mi-bell-" + k.slice(9)],
    ];

    const oldKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) oldKeys.push(k);
    }

    for (const key of oldKeys) {
      for (const [rx, fn] of renameMap) {
        if (rx.test(key)) {
          const newKey = fn(key);
          if (newKey !== key && localStorage.getItem(newKey) === null) {
            const value = localStorage.getItem(key);
            if (value !== null) {
              localStorage.setItem(newKey, value);
              localStorage.removeItem(key);
            }
          }
          break;
        }
      }
    }

    localStorage.setItem(MIGRATION_FLAG, "1");
  } catch {
    // ignore – migration is best-effort
  }
}
