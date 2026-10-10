import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { WorkoutView } from "./WorkoutView";

export default async function ProgramPage({ params }: PageProps<"/rutina/[programId]">) {
  const { programId } = await params;
  return (
    <Suspense fallback={<Loading />}>
      <WorkoutView programId={programId} />
    </Suspense>
  );
}
