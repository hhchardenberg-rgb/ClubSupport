import { SiteHeader } from "@/components/SiteHeader";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata = { title: "Geen toegang" };

export default function Page() {
  return (
    <>
      <SiteHeader area="beheer"><SignOutButton to="/beheer/inloggen" /></SiteHeader>
      <main id="main">
        <h1>Geen toegang</h1>
        <div className="card" role="alert"><p>Je account heeft geen rechten voor deze omgeving.</p></div>
      </main>
    </>
  );
}
