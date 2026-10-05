"use client";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ to }: { to: string }) {
  return (
    <button
      type="button"
      className="secondary small"
      style={{ marginLeft: "auto" }}
      onClick={async () => {
        await authClient.signOut();
        window.location.assign(to);
      }}
    >
      Uitloggen
    </button>
  );
}
