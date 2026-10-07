"use client";
import { Alert, Badge } from "@/components/ui";
import { useState } from "react";
import { noticeSecurityChange } from "@/app/security-actions";
import { MfaSetup } from "@/components/MfaSetup";
import { authClient } from "@/lib/auth-client";

/** Eigen beveiligingsinstellingen: passkeys en herstelcodes. Beschikbaar voor leden, controleurs en beheerders. */
export function SecurityPanel({ area, twoFactorEnabled, mfaRequired }: { area: "beheer" | "scanner" | "ledenpas"; twoFactorEnabled: boolean; mfaRequired: boolean }) {
  const { data: passkeys, isPending, refetch } = authClient.useListPasskeys();
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const supported = typeof window !== "undefined" && !!window.PublicKeyCredential;
  const lastFactor = mfaRequired && !twoFactorEnabled && (passkeys?.length ?? 0) <= 1;

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    setMsg("");
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim().slice(0, 60) || "Passkey";
    const res = await authClient.passkey.addPasskey({ name });
    setBusy(false);
    if (res?.error) return setErr("Passkey toevoegen mislukt of geannuleerd.");
    setMsg("Passkey toegevoegd.");
    await refetch();
    await noticeSecurityChange("passkey_added");
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    setErr("");
    const res = await authClient.passkey.deletePasskey({ id });
    setBusy(false);
    if (res?.error) return setErr("Verwijderen mislukt.");
    setMsg("Passkey verwijderd.");
    await refetch();
    await noticeSecurityChange("passkey_removed");
  }

  async function regenerate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    setMsg("");
    const res = await authClient.twoFactor.generateBackupCodes({ password: String(new FormData(e.currentTarget).get("password") ?? "") });
    setBusy(false);
    if (res.error || !res.data) return setErr("Wachtwoord onjuist.");
    setCodes(res.data.backupCodes);
    await noticeSecurityChange("backup_codes_regenerated");
  }

  return (
    <>
      {msg && <Alert variant="success">{msg}</Alert>}
      {err && <Alert variant="error">{err}</Alert>}

      <section className="card" aria-labelledby="pk">
        <h2 id="pk">Passkeys</h2>
        <p className="muted">Een passkey logt je veilig in met vingerafdruk, gezichtsherkenning of pincode van je toestel, zonder wachtwoord. Je kunt er meerdere hebben (bijv. telefoon en laptop). Voor beheerders en controleurs telt een passkey als tweede factor.</p>
        {!supported && <Alert variant="warning">Deze browser ondersteunt geen passkeys.</Alert>}
        {isPending ? <p>Laden…</p> : (passkeys?.length ?? 0) === 0 ? <p>Je hebt nog geen passkey.</p> : (
          <ul>
            {passkeys!.map((p) => (
              <li key={p.id} style={{ marginBottom: 8 }}>
                <strong>{p.name || "Passkey"}</strong> <Badge>{p.deviceType === "multiDevice" ? "Gesynchroniseerd" : "Dit toestel"}</Badge>{" "}
                <button type="button" className="secondary small" disabled={busy || lastFactor} onClick={() => remove(p.id)} aria-label={`Passkey ${p.name || ""} verwijderen`}>Verwijderen</button>
              </li>
            ))}
          </ul>
        )}
        {lastFactor && <p className="muted">Dit is je enige tweede factor; voeg eerst een andere toe voordat je deze verwijdert.</p>}
        {supported && (
          <form onSubmit={add} className="row" style={{ alignItems: "end" }} autoComplete="off">
            <div style={{ flex: "1 1 220px" }}><label htmlFor="pkname">Naam (bijv. &quot;iPhone Jan&quot;)</label><input id="pkname" name="name" maxLength={60} /></div>
            <button disabled={busy}>Passkey toevoegen</button>
          </form>
        )}
      </section>

      <section className="card" aria-labelledby="au">
        <h2 id="au">Authenticator-app</h2>
        {twoFactorEnabled ? (
          <p><Badge tone="ok">Ingesteld</Badge> Je logt in met een code uit je authenticator-app. Een passkey is een extra mogelijkheid; de authenticator-app blijft werken.</p>
        ) : (
          <>
            <p className="muted">Een authenticator-app (bijv. Google Authenticator of Microsoft Authenticator) is altijd mogelijk, ook als je geen passkey hebt of gebruikt.{mfaRequired ? " Heb je al een passkey? Dan is dit een extra, tweede manier om in te loggen." : ""}</p>
            <MfaSetup area={area} embedded />
          </>
        )}
      </section>

      {twoFactorEnabled && (
        <section className="card" aria-labelledby="hc">
          <h2 id="hc">Herstelcodes</h2>
          <p className="muted">Herstelcodes laten je inloggen als je je telefoon kwijt bent. Elke code werkt één keer. Nieuwe codes maken de oude ongeldig.</p>
          {codes.length > 0 ? (
            <div role="status">
              <p><strong>Bewaar deze codes nu op een veilige plek.</strong> Ze worden niet opnieuw getoond.</p>
              <pre style={{ background: "#fff", padding: 12, border: "2px solid #000" }}>{codes.join("\n")}</pre>
            </div>
          ) : (
            <form onSubmit={regenerate} autoComplete="off">
              <label htmlFor="pw">Bevestig met je wachtwoord</label>
              <input id="pw" name="password" type="password" autoComplete="current-password" required />
              <p><button className="secondary" disabled={busy}>Nieuwe herstelcodes maken</button></p>
            </form>
          )}
        </section>
      )}
    </>
  );
}
