import { FormCoach } from "@/components/pose/FormCoach";

export default async function TechniquePage({ params, searchParams }: PageProps<"/tecnica/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const name = typeof sp.name === "string" ? sp.name : slug.replace(/-/g, " ");
  const pe = typeof sp.pe === "string" ? sp.pe : null;
  return <FormCoach slug={slug} name={name} programExerciseId={pe} />;
}
