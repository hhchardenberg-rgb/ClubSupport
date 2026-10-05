import Link from "next/link";

const NAMES = { ledenpas: "Ledenpas", scanner: "Scanner", beheer: "Beheer" } as const;

export function SiteHeader({ area }: { area?: keyof typeof NAMES }) {
  return (
    <header className="site-header">
      <div className="in">
        <Link className="brand" href={area ? `/${area}` : "/"}>
          HHC <span>ClubSupport</span>
          {area ? <> · {NAMES[area]}</> : null}
        </Link>
      </div>
    </header>
  );
}
