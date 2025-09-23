// src/pages/rifas/crear.jsx
// Alias para no romper enlaces antiguos: /rifas/crear -> /crear-rifa
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function CrearAlias() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/crear-rifa");
  }, [router]);
  return null;
}
