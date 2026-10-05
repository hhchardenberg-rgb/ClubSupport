"use client";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ to }: { to: string }) {
  return (
    <button
      type="button"
      className="secondary"
      style={{ marginLeft: "auto", minHeight: 40, padding: "6px 14px" }}
      onClick={async () => {
        await authClient.signOut();
        window.location.assign(to);
      }}
    >
      Uitloggen
    </button>
  );
}
