import { Logo } from "./Logo";

type Area = "scanner" | "beheer";
const COPY: Record<Area | "ledenpas", { title: string; sub: string }> = {
  ledenpas: { title: "Ledenpas", sub: "Log in om je ledenpas te bekijken." },
  scanner: { title: "Scanner", sub: "Voor controleurs. Elke scan wordt live gecontroleerd." },
  beheer: { title: "Beheer", sub: "Alleen voor beheerders." },
};

/** Gezamenlijke vormgeving voor inlog-, activatie- en herstelpagina's: logo-hero (vervangt de header) + formulier eronder. */
export function AuthShell({ area, title, sub, children }: { area?: Area; title?: string; sub?: string; children: React.ReactNode }) {
  const c = COPY[area ?? "ledenpas"];
  return (
    <>
      <div className="hero">
        <Logo height={96} />
        <h1>{title ?? c.title}</h1>
        {area && <p className="area-tag">{area === "scanner" ? "HHC ClubSupport Scanner" : "HHC ClubSupport Beheer"}</p>}
        <p>{sub ?? c.sub}</p>
      </div>
      <main id="main" className="auth-wrap" style={{ paddingTop: 0 }}>
        {children}
      </main>
    </>
  );
}
