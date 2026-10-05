"use client";
import { useState } from "react";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as { error?: string; message?: string; area?: string } };
}

export function SetPasswordForm({ token, purpose }: { token: string; purpose: "activation" | "reset" }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const pw = String(f.get("password"));
    if (pw !== String(f.get("confirm"))) return setError("De wachtwoorden komen niet overeen.");
    setBusy(true);
    setError("");
    const r = await post(purpose === "activation" ? "/api/account/activate" : "/api/account/reset", { token, password: pw });
    setBusy(false);
    if (r.status !== 200) return setError(r.data.error ?? "Er ging iets mis. Probeer het opnieuw.");
    setDone(r.data.area ?? "ledenpas");
  }

  if (done)
    return (
      <div className="card" role="status">
        <h2>Wachtwoord ingesteld</h2>
        <p>Je kunt nu inloggen.</p>
        <a className="btn" href={`/${done}/inloggen`}>Naar inloggen</a>
      </div>
    );
  return (
    <form onSubmit={onSubmit} className="card" aria-labelledby="h">
      <h2 id="h">{purpose === "activation" ? "Kies je wachtwoord" : "Nieuw wachtwoord"}</h2>
      <label htmlFor="password">Wachtwoord (minimaal 12 tekens)</label>
      <input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
      <label htmlFor="confirm">Herhaal wachtwoord</label>
      <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
      {error && <p role="alert" className="error">{error}</p>}
      <p><button disabled={busy}>{busy ? "Bezig…" : "Wachtwoord opslaan"}</button></p>
    </form>
  );
}

export function ForgotForm() {
  const [sent, setSent] = useState("");
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = await post("/api/account/reset-request", { email: String(new FormData(e.currentTarget).get("email")) });
    setBusy(false);
    setSent(r.data.message ?? "Als dit e-mailadres bij een account hoort, sturen we een link.");
  }
  if (sent) return <div className="card" role="status"><p>{sent}</p></div>;
  return (
    <form onSubmit={onSubmit} className="card" aria-labelledby="h">
      <h2 id="h">Wachtwoord vergeten?</h2>
      <label htmlFor="email">E-mailadres van je account</label>
      <input id="email" name="email" type="email" autoComplete="username" required />
      <p><button disabled={busy}>{busy ? "Bezig…" : "Stuur resetlink"}</button></p>
    </form>
  );
}
