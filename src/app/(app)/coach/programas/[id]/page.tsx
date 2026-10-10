import { ProgramEditor } from "./ProgramEditor";

export default async function Page({ params }: PageProps<"/coach/programas/[id]">) {
  const { id } = await params;
  return <ProgramEditor programId={id} />;
}
