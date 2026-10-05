import { LoginForm } from "@/components/LoginForm";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "Inloggen Ledenpas" };

export default function Page() {
  return (
    <>
      <SiteHeader area="ledenpas" />
      <main id="main">
        <h1>Ledenpas</h1>
        <LoginForm area="ledenpas" />
      </main>
    </>
  );
}
