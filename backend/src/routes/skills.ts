import { listSkills } from "../skills/loader.ts";

export async function skillsRoute(): Promise<Response> {
  const skills = await listSkills();
  return Response.json({ skills });
}
