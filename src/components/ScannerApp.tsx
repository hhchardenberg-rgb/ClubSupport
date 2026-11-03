"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { interpretLookup, interpretScan, type LookupView, type ScanView } from "@/lib/scan-view";

type Phase = "idle" | "scanning" | "checking" | "result";

const Icon = {
  check: (
    <svg aria-hidden="true" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#ff6600" /><path d="M11.5 20.5l6 6 11-12.5" fill="none" stroke="#000" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  cross: (
    <svg aria-hidden="true" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#fff" /><path d="M13.5 13.5l13 13M26.5 13.5l-13 13" stroke="#b00020" strokeWidth="3.6" strokeLinecap="round" /></svg>
  ),
  offline: (
    <svg aria-hidden="true" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#000" /><path d="M8.5 16a16.5 16.5 0 0123 0M13 21.5a10 10 0 0114 0M17 27a4 4 0 016 0" fill="none" stroke="#ff6600" strokeWidth="2.6" strokeLinecap="round" /><circle cx="20" cy="31" r="2" fill="#ff6600" /><path d="M10 31L30 9" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /></svg>
  ),
};

type Panel = { cls: "ok" | "bad" | "warn"; icon: React.ReactNode; title: string; reason?: string; name?: string; number?: string; lines?: string[]; hint?: string };

function panelFor(v: ScanView): Panel {
  switch (v.kind) {
    case "valid":
      return { cls: "ok", icon: Icon.check, title: "GELDIG", name: v.name, number: v.memberNumber, hint: "Vergelijk de naam met het legitimatiebewijs." };
    case "inactive":
      return { cls: "bad", icon: Icon.cross, title: "ONGELDIG", reason: "Pas gedeactiveerd", name: v.name, number: v.memberNumber };
    case "membership":
      return { cls: "bad", icon: Icon.cross, title: "ONGELDIG", reason: "Lidmaatschap niet geldig", name: v.name, number: v.memberNumber };
    case "revoked":
      return { cls: "bad", icon: Icon.cross, title: "ONGELDIG", reason: "Pas ingetrokken of verwijderd" };
    case "unknown":
      return { cls: "bad", icon: Icon.cross, title: "ONGELDIG", reason: "Onbekende code" };
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
      const st = document.querySelector(".scan-stage")?.getBoundingClientRect();
      const aspectRatio = st && st.height > 0 ? Math.round((st.width / st.height) * 100) / 100 : undefined; // camerabeeld past in hetzelfde vak als de uitslag
      await q.start({ facingMode: "environment" }, { fps: 10, aspectRatio, qrbox: (w, h) => ({ width: Math.min(w, h, 260), height: Math.min(w, h, 260) }) }, (text) => void check(text), () => undefined);
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

  return (
    <div>
      {!online && (
        <p role="alert" className="alert warning">
          Geen verbinding. Scannen is niet mogelijk: er wordt nooit een pas als geldig getoond zonder controle.
        </p>
      )}
      <div className="scan-stage">
      {phase === "result" && p && (
        <section role="alert" aria-live="assertive" className={`sr ${p.cls}`}>
          <div className="sr-head">
            {p.icon}
            <h1 className="sr-title">{p.title}</h1>
          </div>
          <div className={`sr-body${p.name ? "" : " solo"}`}>
            {p.reason ? <p className={`sr-reason${p.name ? "" : " alone"}`}>{p.reason}</p> : p.name ? <p className="sr-reason" aria-hidden="true">&nbsp;</p> : null}
            {p.name && <p className="sr-name">{p.name}</p>}
            {p.number && <p className="sr-num">Lidnummer <b>{p.number}</b></p>}
            {p.lines && (
              <>
                <p className="sr-reason alone">{p.lines[0]}</p>
                {p.lines[1] && <p className="sr-sub">{p.lines[1]}</p>}
              </>
            )}
            {p.hint && <p className="sr-hint">{p.hint}</p>}
          </div>
        </section>
      )}
      {phase === "idle" && (
        <div className="sr-idle">
          <svg aria-hidden="true" width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 20V12a4 4 0 014-4h8M36 8h8a4 4 0 014 4v8M48 36v8a4 4 0 01-4 4h-8M20 48h-8a4 4 0 01-4-4v-8" /><rect x="19" y="19" width="7" height="7" rx="1.5" /><rect x="30" y="19" width="7" height="7" rx="1.5" /><rect x="19" y="30" width="7" height="7" rx="1.5" /><path d="M31 33h6M34 30v7" /></svg>
          <p className="sr-idle-title">Klaar om te scannen</p>
          <p className="sr-idle-sub">Tik op Scan starten en richt de camera op de QR-code.</p>
        </div>
      )}
      {phase === "checking" && (
        <p role="status" className="sr-wait">
          <span className="sr-spin" aria-hidden="true" />
          Controleren…
        </p>
      )}


      <div id="scan-region" className={phase === "scanning" ? "scan-region on" : "scan-region"} />
      {phase === "scanning" && <p className="scan-hint" role="status">Richt de camera op de QR-code.</p>}
      </div>

      <div className="row scan-actions">
        {phase === "result" ? (
          <button ref={nextRef} onClick={startCamera} disabled={!online} className="scan-cta">Volgende scan</button>
        ) : phase === "scanning" ? (
          <button className="secondary scan-cta" onClick={async () => { await stopCamera(); setPhase("idle"); }}>Camera stoppen</button>
        ) : (
          <button onClick={startCamera} disabled={!online || phase === "checking"} className="scan-cta">Scan starten</button>
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
            <ul className="lk-list">
              {lookup.results.map((r) => {
                const st = r.pass === "active" ? { cls: "ok", icon: Icon.check, label: "PAS ACTIEF", sub: "Geldig lid" } : r.pass === "deactivated" ? { cls: "bad", icon: Icon.cross, label: "PAS GEDEACTIVEERD", sub: "Niet geldig" } : r.pass === "membership" ? { cls: "bad", icon: Icon.cross, label: "LIDMAATSCHAP NIET GELDIG", sub: "Pas niet bruikbaar" } : { cls: "warn", icon: Icon.cross, label: "GEEN ACTIEVE PAS", sub: "Niet geldig" };
                return (
                  <li key={r.memberNumber} className={`lk ${st.cls}`}>
                    <span className="lk-icon">{st.icon}</span>
                    <span className="lk-main">
                      <strong className="lk-name">{r.name}</strong>
                      <span className="lk-num">Lidnummer {r.memberNumber}</span>
                    </span>
                    <span className="lk-state"><b>{st.label}</b> · {st.sub}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {lookup?.kind === "tooMany" && <p className="notice" role="status">Te veel resultaten. Typ een langere naam of gebruik het lidnummer.</p>}
          {lookup?.kind === "invalid" && <p className="notice" role="status">Voer een naam (minimaal 3 letters) of een lidnummer in.</p>}
          {lookup?.kind === "wait" && <p className="notice" role="status">Even wachten: te veel zoekopdrachten achter elkaar.</p>}
          {lookup?.kind === "session" && <p className="notice" role="alert">Sessie verlopen. Log opnieuw in.</p>}
          {lookup?.kind === "unchecked" && <p role="alert" className="alert warning"><b>NIET GECONTROLEERD</b> · verbinding nodig. Er is geen status vastgesteld.</p>}
        </div>
      </form>
    </div>
  );
}
