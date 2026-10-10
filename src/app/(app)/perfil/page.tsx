import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { ProfileView } from "./ProfileView";

export default function PerfilPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ProfileView />
    </Suspense>
  );
}
