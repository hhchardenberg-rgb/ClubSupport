import type { ReactNode } from "react";

/* Herbruikbare UI-onderdelen. Kleuren: HHC-oranje/zwart/wit; rood alleen voor fouten en onomkeerbare acties; geen groen. */

const ICONS = {
  success: <path d="M6 12.5l4 4 8-9" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />,
  error: <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />,
  info: <path d="M12 11v6M12 7.2v.1" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />,
  warning: <path d="M12 6.5v7M12 17.2v.1" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" />,
};
const ICON_BG = { success: "#ff6600", error: "#b00020", info: "#000", warning: "#fff" } as const;

export type AlertVariant = keyof typeof ICONS;

/** Melding met icoon én tekst (nooit alleen kleur). Fouten gebruiken role="alert", de rest role="status". */
export function Alert({ variant = "info", title, children }: { variant?: AlertVariant; title?: string; children?: ReactNode }) {
  return (
    <div className={`alert ${variant}`} role={variant === "error" || variant === "warning" ? "alert" : "status"}>
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" className="alert-icon">
        <circle cx="12" cy="12" r="11" fill={ICON_BG[variant]} />
        {ICONS[variant]}
      </svg>
      <div>
        {title && <strong className="alert-title">{title}</strong>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

/** Succes-/foutmelding na een actie (via ?msg= / ?err=). */
export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (err) return <Alert variant="error">{err}</Alert>;
  if (msg) return <Alert variant="success">{msg}</Alert>;
  return null;
}

type PassStatusKey = "active" | "deactivated" | "revoked" | "none" | "deleted";
const PASS_BADGE: Record<PassStatusKey, { cls: string; label: string }> = {
  active: { cls: "ok", label: "Actief" },
  deactivated: { cls: "warn", label: "Gedeactiveerd" },
  revoked: { cls: "bad", label: "Ingetrokken" },
  none: { cls: "bad", label: "Geen actieve pas" },
  deleted: { cls: "bad", label: "Verwijderd" },
};

export function StatusBadge({ status }: { status: PassStatusKey }) {
  const b = PASS_BADGE[status];
  return <span className={`badge ${b.cls}`}>{b.label}</span>;
}

export function Badge({ tone = "plain", children }: { tone?: "ok" | "warn" | "bad" | "plain"; children: ReactNode }) {
  return <span className={`badge ${tone === "plain" ? "" : tone}`}>{children}</span>;
}

export function PageTitle({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted sub">{sub}</p>}
      </div>
      {actions && <div className="row actions">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card empty" role="status">
      <h2>{title}</h2>
      {children && <div>{children}</div>}
    </div>
  );
}
