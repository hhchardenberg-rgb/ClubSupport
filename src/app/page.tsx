import { redirect } from "next/navigation";

/** Beginscherm = Ledenpas. Scanner en Beheer zijn hier bewust niet zichtbaar of gelinkt. */
export default function Home() {
  redirect("/ledenpas");
}
