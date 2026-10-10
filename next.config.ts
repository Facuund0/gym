import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components queda APAGADO a propósito: casi todas las pantallas dependen
  // de la sesión del usuario (cookies de Supabase) y la app es muy interactiva.
  // Si en el futuro querés activarlo, leé node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // El service worker tiene que poder controlar todo el sitio y no quedar cacheado.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
