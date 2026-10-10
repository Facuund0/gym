import type { ReactNode } from "react";
import { ProfileProvider } from "@/components/auth/ProfileProvider";
import { AppShell } from "@/components/AppShell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ProfileProvider>
      <AppShell>{children}</AppShell>
    </ProfileProvider>
  );
}
