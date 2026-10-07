-- ===========================================================================
-- Der Rolle hr wird die Nutzerverwaltung entzogen
-- ===========================================================================
--
-- WARUM
--
-- `/nutzerverwaltung` erlaubt, Nutzer anzulegen und vor allem **Rollen zu
-- aendern**. Das ist ein Recht der Hausleitung. Das Bewerbermanagement fuehrt
-- Bewerber bis zum unterschriebenen Vertrag; wer danach den Zugang einrichtet,
-- ist eine getrennte Entscheidung.
--
-- Entscheidung von Christian am 10.09.2026.
--
-- WAS SICH AENDERT UND WAS NICHT
--
-- Die Seite verschwindet aus der Seitenleiste der Rolle hr, und der Waechter
-- an der Route laesst sie nicht mehr durch. Die Zugriffsregeln auf
-- `user_roles` selbst sind davon **unberuehrt**: Dort galt und gilt, dass nur
-- admin und inhaber Rollen schreiben duerfen. Es wird also kein Recht
-- entzogen, das ohnehin nie bestand, sondern eine Seite, die eine Rolle
-- vortaeuschte, die hr nicht hat.
--
-- Braucht jemand mit hr die Seite doch, gehoert sie ihm einzeln ueber
-- `custom_permissions` an seinem Nutzer freigegeben, nicht der ganzen Rolle.
--
-- Wiederholbar: ein zweiter Lauf loescht nichts mehr und meldet keinen Fehler.
-- ===========================================================================

DELETE FROM public.role_permissions
WHERE role = 'hr'
  AND url = '/nutzerverwaltung';
