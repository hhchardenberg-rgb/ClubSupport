import { SetPasswordForm } from "@/components/AccountForms";
import { SiteHeader } from "@/components/SiteHeader";
import { isLinkUsable } from "@/server/activation";

export const metadata = { title: "Wachtwoord opnieuw instellen" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = await isLinkUsable(token, "reset");
  return (
    <>
      <SiteHeader />
      <main id="main">
        <h1>Wachtwoord opnieuw instellen</h1>
        {ok && token ? (
          <SetPasswordForm token={token} purpose="reset" />
        ) : (
          <div className="card" role="alert"><p>Deze link is ongeldig of verlopen. Vraag op de inlogpagina een nieuwe resetlink aan.</p></div>
        )}
      </main>
    </>
  );
}
