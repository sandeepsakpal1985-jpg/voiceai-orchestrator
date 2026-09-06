/** Demo seed must never run against a production environment. */
export function assertDemoSeedAllowed(env: { APP_ENV?: string; NODE_ENV?: string } = process.env) {
  if (env.APP_ENV === "production" || env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo data in production");
  }
}
