"use client";
import { useEffect } from "react";

/** Registreert de service worker van de Ledenpas-app al op de inlogpagina, zodat de offline-pagina klaarstaat vóór het inloggen klaar is. */
export function RegisterLedenpasSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw-ledenpas.js", { scope: "/ledenpas" }).catch(() => undefined);
  }, []);
  return null;
}
