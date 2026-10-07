import { assertEquals } from 'jsr:@std/assert@1'
import { istWeeklyCallLeitung } from './weekly-call-runden.ts'

// Reine Rechnerei, nichts geht ins Netz.

Deno.test('Admin, Inhaber und Vertriebsleitung bekommen die Punkte-Mail', () => {
  for (const rolle of ['admin', 'inhaber', 'vertriebsleiter']) {
    assertEquals(istWeeklyCallLeitung([rolle]), true)
  }
  assertEquals(istWeeklyCallLeitung(['vertriebspartner', 'vertriebsleiter']), true)
})

Deno.test('Vertriebspartner, andere Rollen und unbekannte Adressen nicht', () => {
  assertEquals(istWeeklyCallLeitung(['vertriebspartner']), false)
  assertEquals(istWeeklyCallLeitung(['backoffice']), false)
  assertEquals(istWeeklyCallLeitung([]), false)
})
