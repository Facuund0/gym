import { StudentDetail } from "./StudentDetail";

export default async function Page({ params }: PageProps<"/coach/alumnos/[id]">) {
  const { id } = await params;
  return <StudentDetail studentId={id} />;
}
