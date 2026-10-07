/**
 * Die Adresse, von der unsere automatischen Mails kommen.
 *
 * Muss mit dem Absender in `supabase/functions/send-transactional-email/index.ts`
 * übereinstimmen (dort `noreply@${FROM_DOMAIN}`, also noreply@more.immo).
 * Ändert sich der Absender dort, gehört er hier mit geändert, sonst schicken
 * die Danke-Seiten Bewerber auf die Suche nach der falschen Adresse.
 */
export const MAIL_ABSENDER = "noreply@more.immo";
