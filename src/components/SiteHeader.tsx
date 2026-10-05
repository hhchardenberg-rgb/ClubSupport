import Link from "next/link";
import { Logo } from "./Logo";

const NAMES = { scanner: "Scanner", beheer: "Beheer" } as const;

/** Ledenomgeving: alleen het merk. Scanner/Beheer: merk + omgevingsnaam, nergens aan de ledenkant gelinkt. */
export function SiteHeader({ area, nav, children }: { area?: keyof typeof NAMES; nav?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="site-header">
      <div className="in">
        <Link className="brand" href={area ? `/${area}` : "/"} aria-label={area ? `HHC ClubSupport ${NAMES[area]}` : "HHC ClubSupport Ledenpas"}>
          <Logo height={44} />
          {area ? <span className="area">{NAMES[area]}</span> : null}
        </Link>
        {nav}
        {children}
      </div>
    </header>
  );
}
