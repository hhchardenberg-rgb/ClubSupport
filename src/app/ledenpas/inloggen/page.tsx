import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Inloggen Ledenpas" };

export default function Page() {
  return (
    <main id="main">
      <h1>Ledenpas</h1>
      <LoginForm area="ledenpas" />
    </main>
  );
}
