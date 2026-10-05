import { BRAND } from "@/lib/brand.generated";

/**
 * Officieel logo (zodra verwerkt via scripts/make-icons.mjs), anders een nette woordmerk-terugval.
 * Handboek: minimale grootte 42 px breed, een kwart logobreedte witruimte, nooit vervormen of kleuren.
 */
export function Logo({ height = 44, onOrange = false }: { height?: number; onOrange?: boolean }) {
  if (BRAND.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="logo-img" src={BRAND.logo} alt="HHC ClubSupport" height={height} width={Math.round(height * BRAND.ratio)} style={{ height, width: "auto" }} />;
  }
  return (
    <span className="logo-word" aria-label="HHC ClubSupport" style={{ fontSize: height * 0.5, ...(onOrange ? { color: "#000" } : {}) }}>
      HHC <span style={onOrange ? { color: "#000" } : undefined}>ClubSupport</span>
    </span>
  );
}
