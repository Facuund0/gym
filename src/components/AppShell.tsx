"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useProfile } from "@/components/auth/ProfileProvider";
import { Loading, cn } from "@/components/ui";
import { onForegroundPush } from "@/lib/firebase/client";
import { GYM_NAME } from "@/lib/brand";

type NavItem = { href: string; label: string; icon: ReactNode };

const Icon = {
  home: (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  ),
  dumbbell: (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12" strokeLinecap="round" />
    </svg>
  ),
  camera: (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  ),
  news: (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M5 4h11v16H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1zM16 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h3" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" strokeLinecap="round" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  ),
};

const STUDENT_NAV: NavItem[] = [
  { href: "/inicio", label: "Inicio", icon: Icon.home },
  { href: "/rutina", label: "Rutina", icon: Icon.dumbbell },
  { href: "/tecnica", label: "Técnica", icon: Icon.camera },
  { href: "/novedades", label: "Novedades", icon: Icon.news },
  { href: "/perfil", label: "Perfil", icon: Icon.user },
];

const COACH_NAV: NavItem[] = [
  { href: "/inicio", label: "Inicio", icon: Icon.home },
  { href: "/coach/alumnos", label: "Alumnos", icon: Icon.users },
  { href: "/coach/ejercicios", label: "Ejercicios", icon: Icon.list },
  { href: "/novedades", label: "Novedades", icon: Icon.news },
  { href: "/perfil", label: "Perfil", icon: Icon.user },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { loading, isCoach, profile } = useProfile();
  const pathname = usePathname();
  const [toast, setToast] = useState<{ title: string; body: string; url?: string } | null>(null);

  useEffect(() => {
    let off = () => {};
    void onForegroundPush((p) => {
      setToast(p);
      setTimeout(() => setToast(null), 6000);
    }).then((fn) => (off = fn));
    return () => off();
  }, []);

  const nav = isCoach ? COACH_NAV : STUDENT_NAV;
  const fullBleed = pathname.startsWith("/tecnica/");

  return (
    <div className="flex min-h-dvh flex-col">
      {!fullBleed && (
        <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
            <Link href="/inicio" className="flex items-center gap-2">
              <Image src="/brand-icon.png" alt="" width={28} height={28} className="rounded-md" />
              <span className="font-display text-lg font-bold uppercase tracking-wide">{GYM_NAME}</span>
            </Link>
            {profile && <span className="max-w-[40%] truncate text-sm text-muted">{profile.full_name}</span>}
          </div>
        </header>
      )}

      <main className={cn("flex-1", !fullBleed && "mx-auto w-full max-w-3xl px-4 pb-28 pt-4")}>
        {loading ? <Loading /> : children}
      </main>

      {!fullBleed && (
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
          <ul className="mx-auto grid max-w-3xl grid-cols-5">
            {nav.map((item) => {
              const active = pathname === item.href || (item.href !== "/inicio" && pathname.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex flex-col items-center gap-0.5 pt-2 text-[11px] font-medium",
                      active ? "text-brand" : "text-muted",
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {toast && (
        <Link
          href={toast.url ?? "/novedades"}
          onClick={() => setToast(null)}
          className="fixed inset-x-4 top-4 z-50 mx-auto max-w-md rounded-2xl border border-brand/40 bg-surface p-4 shadow-2xl"
        >
          <p className="font-semibold">{toast.title}</p>
          <p className="text-sm text-muted">{toast.body}</p>
        </Link>
      )}
    </div>
  );
}
