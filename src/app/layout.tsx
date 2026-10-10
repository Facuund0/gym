import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GYM_NAME } from "@/lib/brand";
import { ServiceWorkerRegister } from "@/components/push/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: { default: GYM_NAME, template: `%s · ${GYM_NAME}` },
  description: "Rutinas, seguimiento y corrección de técnica con la cámara.",
  appleWebApp: { capable: true, title: GYM_NAME, statusBarStyle: "black-translucent" },
  icons: { apple: "/icon-180.png" },
};

export const viewport: Viewport = {
  themeColor: "#0f0c0e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
