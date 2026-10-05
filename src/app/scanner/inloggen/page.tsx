import { LoginForm } from "@/components/LoginForm";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "Inloggen Scanner" };

export default function Page() {
  return (
    <>
      <SiteHeader area="scanner" />
      <main id="main">
        <h1>Scanner</h1>
        <LoginForm area="scanner" />
      </main>
    </>
  );
}
