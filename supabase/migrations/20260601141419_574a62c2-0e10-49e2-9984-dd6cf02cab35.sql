-- P1 Security-Härtung: anon EXECUTE auf SECURITY DEFINER Funktionen entziehen.
-- Token-/Public-Flows bleiben für anon ausführbar (Signature, SA-Fill, Mobile-Scan).

-- 1) Anon-EXECUTE entziehen für nicht-öffentliche SECURITY DEFINER Functions
REVOKE EXECUTE ON FUNCTION public.academy_progress_guard() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.academy_progress_insert_guard() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.claim_lead(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.clear_unterlagen_freigabe_on_rejection() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.detect_audit_anomalies() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.dsgvo_hard_delete_kontakt(uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_sla_violations(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.purge_old_webhook_audit_logs() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.run_security_self_check() FROM anon, public;

-- Sicherheitshalber alle übrigen SECURITY-DEFINER Helpers für anon sperren
-- (Trigger-Functions, Cron-Helpers, Admin-RPCs). Reine Trigger benötigen kein EXECUTE-Grant.
REVOKE EXECUTE ON FUNCTION public.bulk_recompute_pipeline() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cascade_delete_investments_on_kontakt() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cleanup_email_artifacts() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limit_buckets() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.confirm_notar_termin(uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.consume_mfa_recovery_code(uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin_role(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_chat_participant(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_internal_role(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_objekt_manager(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_vp_owner_of_kontakt(uuid, uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.kontakt_visible_to_internal(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, text, jsonb, jsonb, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.merge_investment_meta(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.merge_kontakt_meta(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.merge_user_settings(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mfa_recovery_codes_status(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.notify_admins_neue_einreichung() FROM anon, public;
-- OSImmobilien: nur wenn die Funktion existiert (wird nicht per Migration angelegt)
DO $osi$ BEGIN IF to_regprocedure('public.purge_email_queue(text)') IS NOT NULL THEN EXECUTE $q$REVOKE EXECUTE ON FUNCTION public.purge_email_queue(text) FROM anon, public$q$; END IF; END $osi$;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.record_auth_attempt(text, boolean, text, integer, integer, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.register_unterlage_upload(uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.check_auth_lockout(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM anon, public;

-- authenticated braucht weiterhin Zugriff auf die App-RPCs
GRANT EXECUTE ON FUNCTION public.claim_lead(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_notar_termin(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dsgvo_hard_delete_kontakt(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_audit_anomalies() TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_security_self_check() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sla_violations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_investment_meta(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_kontakt_meta(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_user_settings(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfa_recovery_codes_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_mfa_recovery_code(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_unterlage_upload(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chat_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_internal_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_objekt_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_vp_owner_of_kontakt(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kontakt_visible_to_internal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, text, jsonb, jsonb, jsonb) TO authenticated;

-- 2) search_path für die einzige verbliebene mutable Funktion fixieren
ALTER FUNCTION public.get_sla_thresholds(text) SET search_path = public;

-- 3) Public-Token-Flows (Signature, SA-Fill, Mobile-Scan) bleiben explizit anon-callable
GRANT EXECUTE ON FUNCTION public.get_signature_request(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_signature_request(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sa_fill_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_sa_fill_token_used(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_mobile_scan_session(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_mobile_scan_session(text, jsonb, text, text, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_mobile_scan_uploaded_docs(text) TO anon, authenticated;