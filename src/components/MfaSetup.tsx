"use client";
import { Alert } from "@/components/ui";
import QRCode from "qrcode";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { NO_AUTOFILL } from "@/lib/no-autofill";

/** MFA (TOTP) inrichten via de identity provider. Verplicht voor beheer-rollen. */
export function MfaSetup({ area }: { area: "beheer" | "scanner" }) {
  const [step, setStep] = useState<"password" | "scan" | "done">("password");
  const [qr, setQr] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await authClient.twoFactor.enable({ password: String(new FormData(e.currentTarget).get("password")) });
    setBusy(false);
    if (res.error || !res.data || res.data.method !== "totp") return setError("Wachtwoord onjuist.");
    setQr(await QRCode.toDataURL(res.data.totpURI, { margin: 2, width: 240 }));
    setCodes(res.data.backupCodes);
    setStep("scan");
  }

  async function onPasskey() {
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await authClient.passkey.addPasskey({ name: "Passkey" });
    setBusy(false);
    if (res?.error) return setError("Passkey instellen mislukt of geannuleerd.");
    window.location.assign(`/${area}`);
  }

  async function onVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await authClient.twoFactor.verifyTotp({ code: String(new FormData(e.currentTarget).get("verificatie")).replace(/\s/g, "") });
    setBusy(false);
    if (res.error) return setError("Code onjuist. Probeer de huidige code uit je app.");
    setStep("done");
  }

  if (step === "done")
    return (
      <div className="card" role="status">
        <h2>MFA is ingesteld</h2>
        <p>Bewaar deze herstelcodes op een veilige plek. Elke code werkt één keer.</p>
        <pre style={{ background: "#fff", padding: 12, border: "2px solid #000" }}>{codes.join("\n")}</pre>
        <a className="btn" href={`/${area}`}>Verder</a>
      </div>
    );
  if (step === "scan")
    return (
      <form method="post" onSubmit={onVerify} className="card" aria-labelledby="h" autoComplete="off">
        <h2 id="h">Scan met je authenticator-app</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR-code om MFA in te stellen" width={240} height={240} />
        <label htmlFor="verificatie">Voer de 6-cijferige code in</label>
        <input id="verificatie" name="verificatie" type="text" inputMode="numeric" required defaultValue="" pattern="[0-9 ]{6,7}" maxLength={7} {...NO_AUTOFILL} />
        {error && <Alert variant="error">{error}</Alert>}
        <p><button disabled={busy}>Bevestigen</button></p>
      </form>
    );
  return (
    <form method="post" onSubmit={onPassword} className="card" aria-labelledby="h">
      <h2 id="h">Tweestapsverificatie instellen</h2>
      <p>Voor deze omgeving is MFA verplicht. Je hebt een authenticator-app nodig (bijvoorbeeld Google Authenticator of Microsoft Authenticator).</p>
      <label htmlFor="password">Bevestig met je wachtwoord</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      {error && <Alert variant="error">{error}</Alert>}
      <p><button disabled={busy}>Doorgaan</button></p>
      <hr />
      <p className="muted">Liever geen app? Je kunt ook een <strong>passkey</strong> gebruiken (vingerafdruk, gezichtsherkenning of beveiligingssleutel). Een passkey vervangt de authenticator-app.</p>
      <p><button type="button" className="secondary" disabled={busy} onClick={onPasskey}>Passkey instellen</button></p>
    </form>
  );
}
