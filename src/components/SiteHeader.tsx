import Link from "next/link";

const NAMES = { scanner: "Scanner", beheer: "Beheer" } as const;

/** Ledenomgeving: alleen het merk. Scanner/Beheer: merk + omgevingsnaam, nergens aan de ledenkant gelinkt. */
export function SiteHeader({ area, children }: { area?: keyof typeof NAMES; children?: React.ReactNode }) {
  return (
    <header className="site-header">
      <div className="in">
        <Link className="brand" href={area ? `/${area}` : "/"}>
          HHC <span>ClubSupport</span>
          {area ? <> · {NAMES[area]}</> : null}
        </Link>
        {children}
      </div>
    </header>
  );
}
