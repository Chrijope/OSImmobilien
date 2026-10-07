
-- Entferne anon/public EXECUTE auf SECURITY DEFINER Funktionen.
-- Authenticated behält Zugriff (RLS / interne Checks greifen weiter).

-- Sensible RPCs: nur authenticated darf aufrufen
REVOKE EXECUTE ON FUNCTION public.merge_kontakt_meta(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.merge_user_settings(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.register_unterlage_upload(uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.confirm_notar_termin(uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_empfehlung_kontakt(uuid, text, text, text, text, text, text, text, text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, text, jsonb, jsonb, jsonb) FROM anon, public;

-- Role-Checks: dürfen von authenticated genutzt werden, aber nicht vom anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin_role(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_internal_role(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_objekt_manager(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_chat_participant(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_vp_owner_of_kontakt(uuid, uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.kontakt_visible_to_internal(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, public;

-- E-Mail-Queue Funktionen: nur service_role (für Edge Functions / Cron)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_email_queue(text) FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_email_artifacts() FROM anon, public, authenticated;

-- Trigger-Funktionen: kein direkter Aufruf nötig
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.cascade_delete_investments_on_kontakt() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admins_neue_einreichung() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_aktualisiert_am_column() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_profiles_timestamp() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_rechnung_stammdaten_ts() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_academy_progress_timestamp() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.aktualisiere_zeitstempel() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_mss_updated_at_fn() FROM anon, public, authenticated;
