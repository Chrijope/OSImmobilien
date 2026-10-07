/**
 * Startrollen eines frisch angelegten Kontos setzen (04.10.2026).
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * Bis zur Migration 20261004120000 las der Trigger `handle_new_user` die
 * Rolle aus `raw_user_meta_data`. Diese Angabe macht bei der
 * Selbstregistrierung jeder Browser selbst, so konnte sich jeder mit
 * `signUp({ data: { role: 'admin' } })` ein Admin-Konto anlegen. Seitdem
 * liest der Trigger nur noch `raw_app_meta_data`, das allein der Server
 * setzt, und faellt sonst auf 'kunde' zurueck.
 *
 * Supabase Auth schreibt ein mitgegebenes `app_metadata` aber erst NACH dem
 * Anlegen der Zeile in `auth.users` (eigenes Update in derselben
 * Transaktion). Der Trigger laeuft beim Anlegen und sieht die Rolle deshalb
 * nicht, er vergibt 'kunde'. Darum setzt die Function die Rolle hier selbst:
 * Fehlende Rollen eintragen, danach die Rueckfallrolle 'kunde' entfernen,
 * wenn sie nicht gewuenscht ist. In dieser Reihenfolge ist das Konto nie
 * ohne Rolle. Das funktioniert mit dem alten wie mit dem neuen Trigger.
 *
 * Nur direkt nach `auth.admin.createUser` aufrufen, nie fuer ein vorhandenes
 * Konto: Dort waere 'kunde' eine echte Rolle, die nicht verschwinden darf.
 */
export async function startrollenSetzen(
  // deno-lint-ignore no-explicit-any
  admin: any,
  userId: string,
  rollen: string[],
): Promise<void> {
  const gewuenscht = Array.from(new Set(rollen.filter((r) => typeof r === "string" && r)));
  if (gewuenscht.length === 0) throw new Error("Keine Startrolle angegeben");

  const { data, error } = await admin.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`Rollen nicht lesbar: ${error.message}`);
  const vorhanden = new Set((data || []).map((r: { role: string }) => String(r.role)));

  const fehlend = gewuenscht.filter((r) => !vorhanden.has(r));
  if (fehlend.length > 0) {
    const { error: einfuegeFehler } = await admin
      .from("user_roles")
      .insert(fehlend.map((role) => ({ user_id: userId, role })));
    if (einfuegeFehler) throw new Error(`Rolle nicht eingetragen: ${einfuegeFehler.message}`);
  }

  if (vorhanden.has("kunde") && !gewuenscht.includes("kunde")) {
    const { error: loeschFehler } = await admin
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "kunde");
    if (loeschFehler) throw new Error(`Rueckfallrolle kunde nicht entfernt: ${loeschFehler.message}`);
  }
}
