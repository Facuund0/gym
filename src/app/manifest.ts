import type { MetadataRoute } from "next";
import { GYM_NAME, GYM_SHORT_NAME } from "@/lib/brand";

// Manifest PWA. En iOS las notificaciones push SOLO funcionan si el alumno
// instala la app en la pantalla de inicio (Compartir → Agregar a inicio),
// por eso display tiene que ser "standalone".
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: GYM_NAME,
    short_name: GYM_SHORT_NAME,
    description: "Rutinas, seguimiento y corrección de técnica con la cámara.",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f0c0e",
    theme_color: "#0f0c0e",
    lang: "es-AR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
