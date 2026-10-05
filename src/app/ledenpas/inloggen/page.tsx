import { LoginForm } from "@/components/LoginForm";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "Inloggen" };

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <h1>Ledenpas</h1>
        <p className="muted">Log in om je ledenpas te bekijken.</p>
        <LoginForm area="ledenpas" />
      </main>
    </>
  );
}
