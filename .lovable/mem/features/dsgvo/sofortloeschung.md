---
name: DSGVO Art. 17 Sofortlöschung
description: Admin-Only Hard-Delete-Flow mit immutablem Audit-Log, PII-Maskierung und Bestätigungs-Mail
type: feature
---
Admin/Inhaber können Kontakte sofort und unwiderruflich löschen (DSGVO Art. 17), parallel zum bestehenden 7-Tage-Countdown-Flow.

**Komponenten:**
- `DsgvoHardDeleteDialog` (`src/components/dsgvo/`) — wiederverwendbar, drei Pflichtfelder: Checkbox „Kunde hat schriftlich verlangt", Grund-Referenz (min. 3 Zeichen), Namens-Eingabe (muss exakt matchen).
- Eingebunden in: `/papierkorb` (ersetzt alten Purge-Dialog) + Kundendetail-Banner „Löschanfrage ausstehend" (nur Admin/Inhaber, Button neben „Löschung bestätigen").

**RPC `dsgvo_hard_delete_kontakt(_kontakt_id, _grund_referenz, _name_confirmation)`:**
- Berechtigung: nur `is_admin_role(auth.uid())`
- Maskiert alle audit_log-Einträge für diesen Kontakt mit `[GELÖSCHT DSGVO]`
- Löscht: aktivitaeten, benachrichtigungen (Link-Match), follow_ups, notizen, aufgaben, sa_fill_tokens, kontakte (CASCADE-Trigger erledigt investments)
- Schreibt SHA-256 Hash von E-Mail + Name in `dsgvo_deletion_log`

**Tabelle `dsgvo_deletion_log`:** immutable Nachweis für Aufsichtsbehörde. RLS: nur Admin/Inhaber dürfen lesen, kein UPDATE/DELETE möglich, INSERT nur via SECURITY DEFINER RPC.

**Client-Side nach RPC:** Storage-Cleanup für Buckets `unterlagen` und `selbstauskunft-pdfs` (`<kontakt_id>/`) + Bestätigungs-Mail via Template `dsgvo-deletion-confirmation`.
