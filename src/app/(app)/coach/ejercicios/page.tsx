import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { ExerciseLibrary } from "./ExerciseLibrary";

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <ExerciseLibrary />
    </Suspense>
  );
}
