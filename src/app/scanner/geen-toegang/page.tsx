import { SiteHeader } from "@/components/SiteHeader";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata = { title: "Geen toegang" };

export default function Page() {
  return (
    <>
      <SiteHeader area="scanner"><SignOutButton to="/scanner/inloggen" /></SiteHeader>
      <main id="main"><h1>Geen toegang</h1><div className="card" role="alert"><p>Je account heeft geen scannerrechten. Vraag een beheerder om toegang.</p></div></main>
    </>
  );
}
