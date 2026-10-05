"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { interpretLookup, interpretScan, type LookupView, type ScanView } from "@/lib/scan-view";

type Phase = "idle" | "scanning" | "checking" | "result";

const Icon = {
  check: (
    <svg aria-hidden="true" width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="44" fill="#ff6600" stroke="#fff" strokeWidth="4" /><path d="M26 50l15 15 30-34" fill="none" stroke="#000" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  cross: (
    <svg aria-hidden="true" width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="44" fill="#fff" /><path d="M31 31l34 34M65 31L31 65" stroke="#b00020" strokeWidth="10" strokeLinecap="round" /></svg>
  ),
  offline: (
    <svg aria-hidden="true" width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="44" fill="#000" /><path d="M20 38a40 40 0 0156 0M30 49a26 26 0 0136 0M40 60a12 12 0 0116 0" fill="none" stroke="#ff6600" strokeWidth="7" strokeLinecap="round" /><circle cx="48" cy="72" r="5" fill="#ff6600" /><path d="M22 74L74 22" stroke="#fff" strokeWidth="7" strokeLinecap="round" /></svg>
  ),
};

function panelFor(v: ScanView) {
  switch (v.kind) {
    case "valid":
      return { cls: "ok", icon: Icon.check, title: "GELDIG", lines: [v.name, `Lidnummer ${v.memberNumber}`] };
    case "inactive":
      return { cls: "bad", icon: Icon.cross, title: "ONGELDIG", lines: ["Pas gedeactiveerd", v.name, `Lidnummer ${v.memberNumber}`] };
    case "revoked":
      return { cls: "bad", icon: Icon.cross, title: "ONGELDIG", lines: ["Pas ingetrokken of verwijderd"] };
    case "unknown":
      return { cls: "bad", icon: Icon.cross, title: "ONGELDIG", lines: ["Onbekende code"] };
    case "wait":
      return { cls: "warn", icon: Icon.offline, title: "EVEN WACHTEN", lines: ["Te veel scans achter elkaar", "Probeer het zo opnieuw"] };
    case "session":
      return { cls: "warn", icon: Icon.offline, title: "NIET GECONTROLEERD", lines: ["Sessie verlopen", "Log opnieuw in"] };
    default:
      return { cls: "warn", icon: Icon.offline, title: "NIET GECONTROLEERD", lines: ["Verbinding nodig", "Er is geen geldigheid vastgesteld"] };
  }
}

export function ScannerApp() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [view, setView] = useState<ScanView | null>(null);
  const [camError, setCamError] = useState("");
  const [online, setOnline] = useState(true);
  const [lookup, setLookup] = useState<LookupView | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const busy = useRef(false);
  const lookupRef = useRef(false);
  const scanner = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const stopCamera = useCallback(async () => {
    const s = scanner.current;
    scanner.current = null;
    if (!s) return;
    try {
      await s.stop();
    } catch {}
    try {
      s.clear();
    } catch {}
  }, []);

  const check = useCallback(
    async (raw: string) => {
      const code = raw.trim().slice(0, 100);
      if (!code || busy.current) return; // voorkomt dubbele submit/scans
      busy.current = true;
      setPhase("checking");
      await stopCamera();
      let view: ScanView;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 8000);
      try {
        const res = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }), cache: "no-store", credentials: "same-origin", signal: ctl.signal });
        view = interpretScan(res.status, await res.json().catch(() => null));
      } catch {
        view = interpretScan(null, null); // geen verbinding → nooit geldig
      } finally {
        clearTimeout(timer);
      }
      setView(view);
      setPhase("result");
      busy.current = false;
    },
    [stopCamera],
  );

  const search = useCallback(async (raw: string) => {
    const q = raw.trim().slice(0, 60);
    if (!q || lookupRef.current) return;
    lookupRef.current = true;
    setLookupBusy(true);
    setLookup(null);
    let view: LookupView;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch("/api/scan/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }), cache: "no-store", credentials: "same-origin", signal: ctl.signal });
      view = interpretLookup(res.status, await res.json().catch(() => null));
    } catch {
      view = interpretLookup(null, null); // geen verbinding → niets tonen als geldig
    } finally {
      clearTimeout(timer);
    }
    setLookup(view);
    setLookupBusy(false);
    lookupRef.current = false;
  }, []);

  const startCamera = useCallback(async () => {
    setCamError("");
    setView(null);
    setPhase("scanning");
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const q = new Html5Qrcode("scan-region", { verbose: false });
      scanner.current = q as unknown as typeof scanner.current;
      await q.start({ facingMode: "environment" }, { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h, 280), height: Math.min(w, h, 280) }) }, (text) => void check(text), () => undefined);
    } catch (e) {
      scanner.current = null;
      setPhase("idle");
      const name = e instanceof Error ? e.name : "";
      setCamError(name === "NotAllowedError" || /permission/i.test(String(e)) ? "Cameratoegang is geweigerd. Sta de camera toe in de browserinstellingen, of voer de code handmatig in." : "De camera kon niet worden gestart. Voer de code handmatig in.");
    }
  }, [check]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const hide = () => {
      if (document.hidden) {
        void stopCamera(); // camera alleen tijdens actief scannen
        setPhase((p) => (p === "scanning" ? "idle" : p));
      }
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    document.addEventListener("visibilitychange", hide);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw-scanner.js", { scope: "/scanner" }).catch(() => undefined);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      document.removeEventListener("visibilitychange", hide);
      void stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (phase === "result") nextRef.current?.focus();
  }, [phase]);

  const p = view ? panelFor(view) : null;
  const panelStyle: Record<string, React.CSSProperties> = {
    ok: { background: "#000", color: "#fff", border: "8px solid #ff6600" },
    bad: { background: "#b00020", color: "#fff", border: "8px solid #000" },
    warn: { background: "#ff6600", color: "#000", border: "8px solid #000" },
  };

  return (
    <div>
      {!online && (
        <p role="alert" className="card" style={{ background: "#ff6600", fontWeight: 700 }}>
          Geen verbinding. Scannen is niet mogelijk: er wordt nooit een pas als geldig getoond zonder controle.
        </p>
      )}
      {phase === "result" && p && (
        <section role="alert" aria-live="assertive" style={{ ...panelStyle[p.cls], borderRadius: 8, padding: "24px 16px", textAlign: "center", margin: "12px 0" }}>
          {p.icon}
          <h1 style={{ fontSize: "clamp(1.6rem, 8.5vw, 3.2rem)", margin: "8px 0", fontWeight: 900, overflowWrap: "anywhere", lineHeight: 1.05 }}>{p.title}</h1>
          {p.lines.map((l, i) => (
            <p key={l} style={{ margin: "4px 0", fontSize: i === 0 && p.cls !== "ok" ? "1.5rem" : "1.7rem", fontWeight: 700 }}>{l}</p>
          ))}
          {view?.kind === "valid" && <p style={{ fontSize: "1rem", marginTop: 12 }}>Vergelijk de naam met het legitimatiebewijs.</p>}
        </section>
      )}
      {phase === "checking" && <p role="status" className="card" style={{ fontSize: "1.4rem", fontWeight: 700 }}>Controleren…</p>}

      <div id="scan-region" style={{ width: "100%", display: phase === "scanning" ? "block" : "none", background: "#000" }} />
      {phase === "scanning" && <p className="muted" role="status">Richt de camera op de QR-code.</p>}

      <div className="row" style={{ margin: "12px 0" }}>
        {phase === "result" ? (
          <button ref={nextRef} onClick={startCamera} disabled={!online} style={{ flex: 1, minHeight: 64, fontSize: "1.4rem" }}>Volgende scan</button>
        ) : phase === "scanning" ? (
          <button className="secondary" onClick={async () => { await stopCamera(); setPhase("idle"); }} style={{ flex: 1, minHeight: 56 }}>Camera stoppen</button>
        ) : (
          <button onClick={startCamera} disabled={!online || phase === "checking"} style={{ flex: 1, minHeight: 64, fontSize: "1.4rem" }}>Scan starten</button>
        )}
      </div>
      {camError && <p role="alert" className="error">{camError}</p>}

      <form
        method="post"
        className="card"
        aria-labelledby="man"
        onSubmit={(e) => {
          e.preventDefault();
          const f = e.currentTarget;
          const code = String(new FormData(f).get("code") ?? "");
          f.reset();
          void check(code);
        }}
      >
        <h2 id="man">Code handmatig invoeren</h2>
        <label htmlFor="code">Code van de pas</label>
        <input id="code" name="code" autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} maxLength={100} required />
        <p><button disabled={!online || phase === "checking"}>Controleren</button></p>
      </form>

      <form
        method="post"
        className="card"
        aria-labelledby="zoek"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void search(String(new FormData(e.currentTarget).get("q") ?? ""));
        }}
      >
        <h2 id="zoek">Zoeken op naam of lidnummer</h2>
        <p className="muted" style={{ marginTop: 0 }}>Voor een lid dat zijn pas niet bij zich heeft. Controleer altijd de identiteit met een legitimatiebewijs.</p>
        <label htmlFor="q">Naam (minimaal 3 letters) of lidnummer</label>
        <input id="q" name="q" autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} maxLength={60} required />
        <p><button disabled={!online || lookupBusy}>{lookupBusy ? "Zoeken…" : "Zoeken"}</button></p>
        <div aria-live="polite">
          {lookup?.kind === "results" && lookup.results.length === 0 && <p className="notice">Geen lid gevonden. Controleer de schrijfwijze of zoek op lidnummer.</p>}
          {lookup?.kind === "results" && lookup.results.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
              {lookup.results.map((r) => {
                const st = r.pass === "active" ? { bg: "#000", fg: "#fff", bd: "#ff6600", icon: Icon.check, label: "PAS ACTIEF", sub: "Geldig lid" } : r.pass === "deactivated" ? { bg: "#b00020", fg: "#fff", bd: "#000", icon: Icon.cross, label: "PAS GEDEACTIVEERD", sub: "Niet geldig" } : { bg: "#ff6600", fg: "#000", bd: "#000", icon: Icon.cross, label: "GEEN ACTIEVE PAS", sub: "Niet geldig" };
                return (
                  <li key={r.memberNumber} style={{ background: st.bg, color: st.fg, border: `5px solid ${st.bd}`, borderRadius: 10, padding: 12, display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ flex: "0 0 auto", transform: "scale(.6)", transformOrigin: "left center", width: 58 }}>{st.icon}</span>
                    <span>
                      <strong style={{ display: "block", fontSize: "1.3rem" }}>{r.name}</strong>
                      <span>Lidnummer {r.memberNumber}</span>
                      <strong style={{ display: "block", marginTop: 4 }}>{st.label} · {st.sub}</strong>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {lookup?.kind === "tooMany" && <p className="notice" role="status">Te veel resultaten. Typ een langere naam of gebruik het lidnummer.</p>}
          {lookup?.kind === "invalid" && <p className="notice" role="status">Voer een naam (minimaal 3 letters) of een lidnummer in.</p>}
          {lookup?.kind === "wait" && <p className="notice" role="status">Even wachten: te veel zoekopdrachten achter elkaar.</p>}
          {lookup?.kind === "session" && <p className="notice" role="alert">Sessie verlopen. Log opnieuw in.</p>}
          {lookup?.kind === "unchecked" && <p role="alert" style={{ background: "#ff6600", border: "4px solid #000", borderRadius: 8, padding: 12, fontWeight: 700 }}>NIET GECONTROLEERD · verbinding nodig. Er is geen status vastgesteld.</p>}
        </div>
      </form>
    </div>
  );
}
