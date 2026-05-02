import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import {
  allowedOrigins,
  env,
  googleOAuthEnabled,
  isProduction,
} from "../config.ts";
import { getMongoClient } from "../db/client.ts";

let authPromise: ReturnType<typeof build> | null = null;

async function build() {
  const client = await getMongoClient();
  const db = client.db(env.MONGODB_DB_NAME);

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    // Better Auth wraps user+account creation in a transaction by default,
    // but MongoDB transactions require a replica set. Local standalone
    // `mongod` therefore fails with "Transaction numbers are only allowed on
    // a replica set member or mongos". Production MUST run against a replica
    // set (Atlas always is one) — there we keep transactions on so user+
    // account creation stays atomic.
    database: mongodbAdapter(db, { client, transaction: isProduction }),

    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 8,
    },

    socialProviders: googleOAuthEnabled
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID!,
            clientSecret: env.GOOGLE_CLIENT_SECRET!,
          },
        }
      : undefined,

    trustedOrigins: [env.BETTER_AUTH_URL, ...allowedOrigins],
  });
}

export function getAuth() {
  if (!authPromise) authPromise = build();
  return authPromise;
}

export type Auth = Awaited<ReturnType<typeof getAuth>>;
