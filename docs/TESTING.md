# Testoverzicht

Laatste volledige run (lokaal, Postgres 16, Node 22, Chromium): **41 unit-/integratietests + 19 end-to-end-/browsertests, allemaal geslaagd.** De CI-workflow (`.github/workflows/ci.yml`) is geschreven maar nog niet op GitHub gedraaid.

```bash
npm test          # unit/integratie (tests/*.test.ts)
npm run test:e2e  # next build + e2e + browser (tests-e2e/*.test.ts)
```

## Dekking per gevraagde test

| # | Vereiste | Status | Waar |
|---|---|:-:|---|
| 1 | Beheerder maakt lid/pas; unieke QR; geen persoonsgegevens | ✔ | `passes.test.ts` (token opaque, 256 bit, uniek, niet in DB-rij), `accounts.test.ts` |
| 2 | Geautoriseerde scanner ziet geldigheid, naam, lidnummer | ✔ | `passes.test.ts`, `roles.test.ts` (scan-endpoint), `browser.test.ts` (echte browser) |
| 3 | Account ziet gekoppelde passen; niet-gekoppeld id/token geeft geen toegang | ✔ | `accounts.test.ts`, `roles.test.ts` (ledenpas + Wallet-IDOR) |
| 4 | Deactiveren/verwijderen/heruitgeven → oude token direct ongeldig | ✔ | `passes.test.ts`, `roles.test.ts` (via live endpoint) |
| 5 | Pas blijft geldig tot expliciete deactivatie; tijd/betaling doet niets | ✔ | `passes.test.ts` (pas uit 2000, notitie "niet betaald" → nog geldig) |
| 6 | CSV-preview: ontbrekende velden, duplicaten, ongeldige rijen, geen acties | ✔ | `import.test.ts` |
| 7 | Onbekende, gemanipuleerde, te vaak aangeboden codes | ✔ | `passes.test.ts`, `roles.test.ts` (429 bij te veel scans) |
| 8 | Offline scanner toont nooit geldig | ✔ | `scan-view.test.ts` (alle fout-/rommelantwoorden), `browser.test.ts` (offline, abort, 500, HTML-200) |
| 9 | Scanner-rol kan niet naar ledenbeheer/admin | ✔ | `roles.test.ts` (alle beheer-routes); zie beperking hieronder |
| 10 | Wallet-artefacten correct; ontbrekende credentials → duidelijke setup | ✔ (testconfig) | `wallet.test.ts` (pkpass met **testcertificaten**, Google-JWT met testsleutel, ontbrekende env), `roles.test.ts` (503 + melding) |
| 11 | Account met meerdere leden ziet alle passen; ongekoppeld blijft ontoegankelijk | ✔ | `accounts.test.ts`, `roles.test.ts` |
| 12 | CSV-preview groepeert gedeelde e-mail zonder duplicaat; bevestiging vereist | ✔ | `import.test.ts` |
| 13 | ≤ 1 uitnodiging per nieuw account; bestaand account alleen melding, geen wachtwoordwijziging | ✔ | `accounts.test.ts`, `links.test.ts`, `import.test.ts` |
| 14 | Activatie-/resetlinks eenmalig, verlopen, gehasht, geen account-enumeratie | ✔ | `links.test.ts` |
| 15 | PWA, camera, handmatige invoer, responsive op iOS Safari/Android Chrome | **gedeeltelijk** | `browser.test.ts`: Chromium met Pixel 5/iPhone 13-emulatie, nepcamera, geweigerde camera, handmatige invoer, offline, manifesten + iconen + service worker, geen CSP-fouten, 320 px-breedte. **Niet** op echte toestellen of in echte Safari/WebKit |

Aanvullend gedekt: bewaartermijnen/opruimjob en cron-autorisatie (`retention.test.ts`), CSRF/Origin op eigen routes, security headers, geblokkeerd account, MFA-redirect voor beheerrollen, hoofdpagina zonder Scanner/Beheer-verwijzingen (`roles.test.ts`).

## Bekende gaten in de tests
- **Server actions** worden via de pagina's en de `requireStaff`-guard beschermd en de routes zijn e2e getest, maar elke afzonderlijke action is niet met een ruw POST-verzoek aangeroepen door een onbevoegde rol.
- **MFA-inrichting** (TOTP scannen/bevestigen) is niet geautomatiseerd getest; alleen de redirect-eis en de inlogstap zijn gedekt.
- **Echte Apple/Google/Resend-accounts** zijn niet gebruikt: pkpass is ondertekend met testcertificaten (Apple Wallet kan een pas met testcertificaten niet openen) en de Google API is gemockt.
- Geen belasting-, toegankelijkheids- (schermlezer) of penetratietest. Contrast en toetsenbordbediening zijn ontworpen (zichtbare focus, grote tikdoelen, labels, `role=alert`) maar niet met een schermlezer geverifieerd.

## Handmatige apparaattest (uit te voeren door de club vóór livegang)

**iPhone/iPad (Safari, HTTPS-productie-URL):**
1. Ledenpas: inloggen → pas zichtbaar → *Deel → Zet op beginscherm* → app opent standalone met eigen icoon/naam.
2. Scanner (`/scanner`): inloggen als controleur → *Zet op beginscherm* → naam "Scanner" en ander icoon dan Ledenpas.
3. Scan starten → cameratoestemming verschijnt pas na de tik; scan een pas → GELDIG met naam; gedeactiveerde pas → ONGELDIG; vliegtuigmodus → "Niet gecontroleerd".
4. Camera geweigerd (Instellingen → Safari) → duidelijke melding + handmatige invoer werkt.
5. Wallet: *Toevoegen aan Apple Wallet* (na configuratie van certificaten).

**Android (Chrome):** idem; installatiebanner of *Menu → App installeren*; Google Wallet-knop (na issuer-configuratie).

**Beide:** schermen op 320–430 px zonder horizontaal scrollen; scanresultaat leesbaar in fel zonlicht (hoogste schermhelderheid); schermlezer (VoiceOver/TalkBack) leest de resultaten voor (`role=alert`).
