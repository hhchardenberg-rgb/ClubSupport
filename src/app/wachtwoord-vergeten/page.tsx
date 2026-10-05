import { ForgotForm } from "@/components/AccountForms";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "Wachtwoord vergeten" };

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <h1>Wachtwoord vergeten</h1>
        <ForgotForm />
      </main>
    </>
  );
}
