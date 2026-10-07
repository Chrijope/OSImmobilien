-- ===========================================================================
-- Registrierung ohne Rollenwahl: handle_new_user liest die Rolle nur noch
-- aus raw_app_meta_data
-- ===========================================================================
--
-- DIE LUECKE (live bestaetigt am 04.10.2026)
--
-- Der Trigger on_auth_user_created vergab die Rolle aus
-- raw_user_meta_data ->> 'role'. Diese Angabe macht bei der
-- Selbstregistrierung der Browser selbst, und die Selbstregistrierung ist in
-- Supabase eingeschaltet. Mit einem direkten signUp und data.role = 'admin'
-- konnte sich so jeder ein Admin-Konto anlegen.
--
-- WAS DIESE MIGRATION TUT
--
-- Ersetzt nur den Rumpf von public.handle_new_user(). Die Rolle kommt allein
-- aus raw_app_meta_data ->> 'role', das nur der Server setzt; sonst 'kunde'.
-- Die Profilanlage bleibt unveraendert (Name aus raw_user_meta_data ist
-- harmlos). Der Trigger selbst bleibt, wie er ist. Aendert keine Daten,
-- wiederholbar.
--
-- WICHTIG ZUR REIHENFOLGE: ERST DIE FUNCTIONS, DANN DIESE MIGRATION
--
-- Supabase Auth schreibt ein mitgegebenes app_metadata erst nach dem Anlegen
-- der Zeile in auth.users. Der Trigger sieht es also nicht und vergibt
-- 'kunde'. Deshalb setzen invite-user, setup-admin und create-test-accounts
-- die Rolle seit dem 04.10.2026 selbst (_shared/startrolle.ts) und raeumen
-- die Rueckfallrolle 'kunde' wieder ab. Laeuft diese Migration VOR dem
-- Ausrollen dieser drei Functions, bekommt jede neu eingeladene Mitarbeiterin
-- und jeder neue Partner nur die Rolle 'kunde'. Also:
--   1. invite-user, setup-admin, create-test-accounts in Lovable ausrollen
--   2. danach diese Migration ausfuehren
--
-- NICHT ABGEDECKT
--
-- Wer sich selbst registriert, bekommt weiterhin 'kunde'. Ganz zu ist die
-- Tuer erst, wenn die Selbstregistrierung in den Auth-Einstellungen
-- abgeschaltet ist; alle Konten entstehen ohnehin ueber invite-user.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email),
    NEW.email
  );
  -- Rolle nur aus raw_app_meta_data, das setzt allein der Server.
  -- raw_user_meta_data kommt bei der Selbstregistrierung aus dem Browser.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    COALESCE(
      (NEW.raw_app_meta_data ->> 'role')::app_role,
      'kunde'::app_role
    )
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public, authenticated;

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeile 58.1 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
