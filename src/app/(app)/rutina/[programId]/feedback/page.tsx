import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { WeeklyFeedbackForm } from "./WeeklyFeedbackForm";

export default async function FeedbackPage({ params }: PageProps<"/rutina/[programId]/feedback">) {
  const { programId } = await params;
  return (
    <Suspense fallback={<Loading />}>
      <WeeklyFeedbackForm programId={programId} />
    </Suspense>
  );
}
