"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type Area = "ledenpas" | "scanner" | "beheer";

export function LoginForm({ area }: { area: Area }) {
  const [step, setStep] = useState<"password" | "totp">("password");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function onTotp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const res = await authClient.twoFactor.verifyTotp({ code: String(f.get("code")).replace(/\s/g, "") });
    setBusy(false);
    if (res.error) return setError("Code onjuist of verlopen.");
    window.location.assign(`/${area}`);
  }

  if (step === "totp") {
    return (
      <form onSubmit={onTotp} className="card" aria-labelledby="t">
        <h2 id="t">Verificatiecode</h2>
        <label htmlFor="code">6-cijferige code uit je authenticator-app</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9 ]{6,7}" />
        {error && <p role="alert" className="error">{error}</p>}
        <p><button disabled={busy}>Bevestigen</button></p>
      </form>
    );
  }
  return (
    <form onSubmit={onPassword} className="card" aria-labelledby="l">
      <h2 id="l">Inloggen</h2>
      <label htmlFor="email">E-mailadres</label>
      <input id="email" name="email" type="email" autoComplete="username" required />
      <label htmlFor="password">Wachtwoord</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      {error && <p role="alert" className="error">{error}</p>}
      <p><button disabled={busy}>{busy ? "Bezig…" : "Inloggen"}</button></p>
      <p><a href="/wachtwoord-vergeten">Wachtwoord vergeten?</a></p>
    </form>
  );
}
