import { getAuth } from "./instance.ts";
import { unauthorized } from "../lib/http.ts";

export interface SessionUser {
  id: string;
  email: string;
  name?: string;
  image?: string;
}

export interface ResolvedSession {
  user: SessionUser;
}

export async function requireSession(
  req: Request,
): Promise<ResolvedSession | Response> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return unauthorized();
  }
  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? undefined,
      image: session.user.image ?? undefined,
    },
  };
}
