# Instructies voor (AI-)ontwikkelaars

Taal van de interface en documentatie: **Nederlands**. Namen consequent: **HHC ClubSupport**, **Ledenpas**, **Scanner**, **Beheer**.

## Harde regels
- Statusregels staan op **één plek**: `src/lib/status.ts`. Geldigheid wordt nooit elders afgeleid.
- De scanner mag **nooit** "GELDIG" tonen zonder exact verwacht serverantwoord: `src/lib/scan-view.ts` is de enige vertaallaag; wijzig die alleen met bijbehorende tests (`tests/scan-view.test.ts`).
- Een ingetrokken token (`revoked`) wordt nooit heractiveerd; `tokenCiphertext` wordt dan gewist.
- Geen persoonsgegevens, tokens of secrets in QR-codes, audit-metadata, scanlog, e-mails of logs. `audit()` filtert sleutelnamen als vangnet, niet als vrijbrief.
- Autorisatie altijd server-side: pagina's `requireStaff`/`requireMember`, API's `apiStaff`/`getSession`, server actions beginnen met `requireStaff`. Rechten staan in `src/lib/permissions.ts`.
- Koppel accounts en leden nooit op e-mailgelijkheid; gebruik `account_member_access` met bevestiging door een beheerder.
- Alle pagina's moeten per verzoek renderen (de CSP-nonce uit `src/proxy.ts` komt anders niet op de scripts). Behoud `await connection()` in `src/app/layout.tsx`.
- Service workers (`public/sw-*.js`) cachen nooit `/api/*`, pagina's met ledengegevens of scanresultaten.
- Wijzig bestaande migraties in `drizzle/` nooit; genereer een nieuwe (`npx drizzle-kit generate`).
- Gebruik geen groen in de UI; alleen HHC-oranje `#ff6600`, zwart, wit/grijs (rood alleen voor fouten/onomkeerbare acties). Oranje nooit als tint en nooit als tekst op wit/grijs.
- Scanner-zoeken (`lookupMembers`) blijft beperkt: min. 3 tekens, max. 8 resultaten, alleen naam/lidnummer/passtatus, zoekterm nooit loggen.
- Geldigheid van een scan = pas `active` **én** lidmaatschap nu geldig (`src/lib/membership.ts`, `src/lib/status.ts`); houd lid-, lidmaatschaps-, account- en passtatus gescheiden en gebruik de ene niet als vervanger van de andere.
- E-mail is **nooit** een identiteit of matchsleutel: nooit leden of accounts samenvoegen of koppelen op e-mail/naam; geen eigenmachtige normalisatie van plus-adressen.
- Archiveren (omkeerbaar) en verwijderen (na archivering, wissen na bewaartermijn) zijn verschillende handelingen; verwijderen mag nooit accounts of andere leden raken.
- Een scanuitkomst of ledenweergave bevat nooit de reden van een schorsing/beëindiging of beheerdersnotities.
- Geen secrets in de repository; alleen namen in `.env.example`.

- Gebruik de gedeelde UI-onderdelen (`src/components/ui.tsx`, `Logo`, `SiteHeader`, `AuthShell`) en de klassen in `globals.css`; maak geen losse stijlen per pagina. Het logo komt uit `src/lib/brand.generated.ts` (script `scripts/make-icons.mjs`); teken of kleur het logo nooit zelf.

## Werkwijze
- `npx tsc --noEmit && npm test && npm run test:e2e` vóór elke push.
- Documentatie: `README.md` (setup, model, beperkingen), `docs/SECURITY.md` (dreigingsmodel, matrix, ASVS, runbook), `docs/TESTING.md`.
