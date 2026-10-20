/*
 * Ersatz für `@/integrations/supabase/client` in der eigenständigen Fassung
 * (vite.artefakt.config.ts). Sie hat kein Backend und keine Zugangsdaten:
 * Jeder Aufruf, egal wie verkettet (`from().select().eq()`, `auth.getSession()`,
 * `channel().on().subscribe()`, `functions.invoke()`), sendet nichts und
 * liefert ein leeres Ergebnis.
 */
const LEER = { data: null, error: null, count: 0 };

function attrappe(): any {
  const ziel = function () {} as any;
  return new Proxy(ziel, {
    get(_t, name) {
      // Awaitbar: `await supabase.from("x").select()` ergibt das leere Ergebnis.
      if (name === "then") return (fertig: (v: unknown) => void) => fertig(LEER);
      if (name === Symbol.toPrimitive) return () => "";
      return attrappe();
    },
    apply() {
      return attrappe();
    },
  });
}

export const supabase = attrappe();
export default supabase;
