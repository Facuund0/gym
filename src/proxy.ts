import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16: "middleware.ts" pasó a llamarse "proxy.ts".
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Todo menos archivos estáticos, imágenes y el service worker.
    "/((?!_next/static|_next/image|favicon.ico|icon|sw.js|templates/|brand-|icon-|.*\\.(?:svg|png|jpg|jpeg|gif|webp|xlsx|task|wasm)$).*)",
  ],
};
