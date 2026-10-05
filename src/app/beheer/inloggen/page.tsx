import { LoginForm } from "@/components/LoginForm";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "Inloggen Beheer" };

export default function Page() {
  return (
    <>
      <SiteHeader area="beheer" />
      <main id="main">
        <h1>Beheer</h1>
        <LoginForm area="beheer" />
      </main>
    </>
  );
}
