"use client";
import { Alert } from "@/components/ui";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { NO_AUTOFILL } from "@/lib/no-autofill";

type Area = "ledenpas" | "scanner" | "beheer";

export function LoginForm({ area }: { area: Area }) {
  const [step, setStep] = useState<"password" | "totp" | "backup">("password");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [canPasskey, setCanPasskey] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCanPasskey(typeof window !== "undefined" && !!window.PublicKeyCredential);
  }, []);
  // Een verificatieveld begint altijd leeg (ook bij terug/vooruit in de browser).
  useEffect(() => {
    if (codeRef.current) codeRef.current.value = "";
  }, [step]);

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const res = await authClient.signIn.email({ email: String(f.get("email")), password: String(f.get("password")) });
    setBusy(false);
    if (res.error) {
      // Generiek: verklap niet of het account bestaat.
      setError(res.error.status === 429 ? "Te veel pogingen. Probeer het over enkele minuten opnieuw." : "Inloggen mislukt. Controleer je gegevens.");
      return;
    }
    if ((res.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
      setStep("totp");
      return;
    }
    window.location.assign(`/${area}`);
  }

  async function onPasskey() {
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await authClient.signIn.passkey();
    setBusy(false);
    if (res?.error) return setError(res.error.status === 429 ? "Te veel pogingen. Probeer het over enkele minuten opnieuw." : "Inloggen met passkey mislukt of geannuleerd.");
    window.location.assign(`/${area}`);
  }

  async function onCode(e: React.FormEvent<HTMLFormElement>, kind: "totp" | "backup") {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const raw = String(new FormData(e.currentTarget).get("verificatie") ?? "");
    const res = kind === "totp" ? await authClient.twoFactor.verifyTotp({ code: raw.replace(/\s/g, "") }) : await authClient.twoFactor.verifyBackupCode({ code: raw.trim() });
    setBusy(false);
    if (res.error) {
      if (codeRef.current) codeRef.current.value = "";
      return setError(kind === "totp" ? "Code onjuist of verlopen." : "Herstelcode onjuist of al gebruikt.");
    }
    window.location.assign(`/${area}`);
  }

  if (step === "totp" || step === "backup") {
    const isTotp = step === "totp";
    return (
      <form method="post" onSubmit={(e) => onCode(e, step)} className="card" aria-labelledby="t" autoComplete="off">
        <h2 id="t">{isTotp ? "Verificatiecode" : "Herstelcode"}</h2>
        <label htmlFor="verificatie">{isTotp ? "6-cijferige code uit je authenticator-app" : "Een van je herstelcodes (elke code werkt één keer)"}</label>
        <input
          ref={codeRef}
          id="verificatie"
          name="verificatie"
          type="text"
          inputMode={isTotp ? "numeric" : "text"}
          required
          defaultValue=""
          {...(isTotp ? { pattern: "[0-9 ]{6,7}", maxLength: 7 } : { maxLength: 40 })}
          {...NO_AUTOFILL}
        />
        {error && <Alert variant="error">{error}</Alert>}
        <p><button disabled={busy}>Bevestigen</button></p>
        <p>
          <button type="button" className="secondary small" onClick={() => { setError(""); setStep(isTotp ? "backup" : "totp"); }}>
            {isTotp ? "Telefoon kwijt? Gebruik een herstelcode" : "Terug naar de authenticator-code"}
          </button>
        </p>
        {!isTotp && <p className="muted">Geen herstelcodes meer? Vraag een systeembeheerder om je tweestapsverificatie te resetten.</p>}
      </form>
    );
  }
  return (
    <form method="post" onSubmit={onPassword} className="card" aria-labelledby="l">
      <h2 id="l">Inloggen</h2>
      <label htmlFor="email">E-mailadres</label>
      <input id="email" name="email" type="email" autoComplete="username" required />
      <label htmlFor="password">Wachtwoord</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      {error && <Alert variant="error">{error}</Alert>}
      <p><button disabled={busy}>{busy ? "Bezig…" : "Inloggen"}</button></p>
      {canPasskey && <p><button type="button" className="secondary" onClick={onPasskey} disabled={busy}>Inloggen met passkey</button></p>}
      <p><a href="/wachtwoord-vergeten">Wachtwoord vergeten?</a></p>
    </form>
  );
}
