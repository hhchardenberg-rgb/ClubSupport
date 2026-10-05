import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <p className="slogan">#Samen<br />maken we<br /><b>HHC</b></p>
        <h1>HHC ClubSupport</h1>
        <p className="muted">Supportersvereniging van HHC Hardenberg.</p>
        <div className="card"><h2>Ledenpas</h2><p>Bekijk je ledenpas en zet die in je Wallet.</p><Link className="btn" href="/ledenpas">Naar Ledenpas</Link></div>
        <div className="card"><h2>Scanner</h2><p>Voor controleurs: ledenpassen controleren.</p><Link className="btn secondary" href="/scanner">Naar Scanner</Link></div>
        <div className="card"><h2>Beheer</h2><p>Voor beheerders: leden en passen beheren.</p><Link className="btn secondary" href="/beheer">Naar Beheer</Link></div>
      </main>
    </>
  );
}
