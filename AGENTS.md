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
- Geen secrets in de repository; alleen namen in `.env.example`.

## Werkwijze
- `npx tsc --noEmit && npm test && npm run test:e2e` vóór elke push.
- Documentatie: `README.md` (setup, model, beperkingen), `docs/SECURITY.md` (dreigingsmodel, matrix, ASVS, runbook), `docs/TESTING.md`.
