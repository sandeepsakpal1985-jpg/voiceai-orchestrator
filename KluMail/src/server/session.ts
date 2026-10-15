import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import { actorFromToken, listOrganizations } from "@/server/actor";
import type { Actor } from "@/lib/types";

export async function requirePageActor(): Promise<Actor> {
  const jar = await cookies();
  const actor = await actorFromToken(jar.get("klumail_session")?.value, jar.get("klumail_org")?.value ?? null);
  if (!actor) {
    const session = await getSession(jar.get("klumail_session")?.value);
    redirect(session ? "/onboarding" : "/login");
  }
  return actor;
}

export async function pageOrganizations(userId: string) {
  return listOrganizations(userId);
}
