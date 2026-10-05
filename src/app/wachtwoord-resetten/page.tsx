import { SetPasswordForm } from "@/components/AccountForms";
import { AuthShell } from "@/components/AuthShell";
import { isLinkUsable } from "@/server/activation";

export const metadata = { title: "Wachtwoord opnieuw instellen" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = await isLinkUsable(token, "reset");
  return (
    <AuthShell title="Nieuw wachtwoord" sub="Kies een nieuw wachtwoord voor je account.">
      {ok && token ? <SetPasswordForm token={token} purpose="reset" /> : <div className="card" role="alert"><p>Deze link is ongeldig of verlopen. Vraag op de inlogpagina een nieuwe resetlink aan.</p></div>}
    </AuthShell>
  );
}
