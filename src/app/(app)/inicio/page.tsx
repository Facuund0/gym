"use client";

import { useProfile } from "@/components/auth/ProfileProvider";
import { CoachHome } from "./CoachHome";
import { StudentHome } from "./StudentHome";

export default function InicioPage() {
  const { isCoach } = useProfile();
  return isCoach ? <CoachHome /> : <StudentHome />;
}
