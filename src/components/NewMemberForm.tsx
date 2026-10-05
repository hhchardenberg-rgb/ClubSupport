"use client";
import { useActionState } from "react";
import { createMemberAction, type FormState } from "@/app/beheer/(app)/actions";

export function NewMemberForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createMemberAction, undefined);
  return (
    <form action={action} className="card" aria-labelledby="h">
      <h2 id="h">Gegevens</h2>
      <label htmlFor="memberNumber">Lidnummer (uniek)</label>
      <input id="memberNumber" name="memberNumber" required maxLength={32} pattern="[A-Za-z0-9._\-/]+" />
      <label htmlFor="fullName">Naam</label>
      <input id="fullName" name="fullName" required maxLength={120} />
      <label htmlFor="email">E-mailadres voor het account (de onboardingmail gaat hierheen)</label>
      <input id="email" name="email" type="email" maxLength={254} />
      <label htmlFor="membershipNote">Notitie (optioneel, heeft geen invloed op de geldigheid van de pas)</label>
      <input id="membershipNote" name="membershipNote" maxLength={300} />
      {state?.needsConfirm && (
        <div className="notice" role="alert" style={{ marginTop: 16 }}>
          <p><strong>Dit e-mailadres hoort al bij een account</strong> ({state.needsConfirm.email}) met {state.needsConfirm.members.length} gekoppeld(e) lid/leden:</p>
          <ul>{state.needsConfirm.members.map((m) => <li key={m.memberNumber}>{m.memberNumber} · {m.fullName}</li>)}</ul>
          <p>Het nieuwe lid blijft een apart lid met eigen pas. Er komt geen tweede account en geen nieuwe activatiecode; het account krijgt alleen een melding. Iedereen met toegang tot dat account ziet daarna ook deze pas.</p>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="confirmLink" style={{ width: 24, minHeight: 24 }} required /> Ik bevestig dat dit lid aan dit account wordt gekoppeld
          </label>
        </div>
      )}
      {state?.error && <p role="alert" className="error">{state.error}</p>}
      <p><button disabled={pending}>{pending ? "Bezig…" : state?.needsConfirm ? "Bevestigen en aanmaken" : "Lid en pas aanmaken"}</button></p>
    </form>
  );
}
