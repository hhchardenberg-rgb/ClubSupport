import { AuthShell } from "@/components/AuthShell";
import { Alert } from "@/components/ui";
import { describeUnsubscribe } from "@/server/newsletter";
import { unsubscribeAction } from "./actions";

export const metadata = { title: "Afmelden voor nieuwsbrieven", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Openbare afmeldpagina. Tonen muteert niets (veilig tegen link-prefetching); afmelden gebeurt pas na een klik op de knop. */
export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ klaar?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const d = await describeUnsubscribe(token);
  return (
    <AuthShell title="Nieuwsbrief" sub="Afmelden voor nieuwsbrieven van HHC ClubSupport.">
      {!d ? (
        <Alert variant="error">Deze afmeldlink is ongeldig of verlopen. Neem contact op met HHC ClubSupport als u geen nieuwsbrieven meer wilt ontvangen.</Alert>
      ) : d.alreadyUnsubscribed || sp.klaar ? (
        <Alert variant="success" title="U bent afgemeld">Het adres {d.masked} ontvangt geen nieuwsbrieven meer. Mails over uw account en ledenpas blijven werken.</Alert>
      ) : (
        <form action={unsubscribeAction} className="card" aria-labelledby="af">
          <h2 id="af">Afmelden</h2>
          <p>Wilt u geen nieuwsbrieven meer ontvangen op <strong>{d.masked}</strong>? Dit geldt voor alle nieuwsbrieven naar dit adres.</p>
          <input type="hidden" name="token" value={token} />
          <p><button>Afmelden voor nieuwsbrieven</button></p>
        </form>
      )}
    </AuthShell>
  );
}
