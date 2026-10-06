import { NewsletterForm } from "@/components/NewsletterForm";
import { Flash, PageTitle } from "@/components/ui";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Nieuwe nieuwsbrief" };

export default async function Page({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  await requireStaff("beheer", "newsletter.manage");
  const sp = await searchParams;
  return (
    <>
      <PageTitle title="Nieuwe nieuwsbrief" sub="Eerst een concept; verzenden doet u pas na een voorbeeld, een testmail en bevestiging." />
      <Flash err={sp.err} />
      <NewsletterForm />
    </>
  );
}
