import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@klunex-edu/database";
import { CSRF_HEADER } from "@klunex-edu/shared";
import { buildApp } from "../../app.js";
import { ingestScan } from "./service.js";

const password = "DemoPassw0rd!";
type App = Awaited<ReturnType<typeof buildApp>>;
type Auth = { headers: { cookie: string; [key: string]: string } };

let app: App;

async function login(email: string): Promise<Auth> {
  const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
  expect(res.statusCode, res.body).toBe(200);
  const body = res.json() as { csrfToken: string };
  const cookies = res.cookies.map((c: { name: string; value: string }) => `${c.name}=${c.value}`).join("; ");
  return { headers: { cookie: cookies, [CSRF_HEADER]: body.csrfToken } };
}

function json<T>(res: { json: () => unknown }) {
  return res.json() as T;
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");
  app = await buildApp();
  const aarav = await prisma.student.findFirst({ where: { firstName: "Aarav", lastName: "Sharma" } });
  if (!aarav) throw new Error("Demo student Aarav is required");
  let gate = await prisma.accessGate.findFirst({ where: { institutionId: aarav.institutionId, code: "MAIN" } });
  if (!gate) {
    gate = await prisma.accessGate.create({
      data: { institutionId: aarav.institutionId, name: "Main Gate", code: "MAIN", status: "ACTIVE" },
    });
  }
  const argon2 = (await import("argon2")).default;
  const secretHash = await argon2.hash("DemoDeviceSecret!", { type: argon2.argon2id });
  await prisma.accessDevice.upsert({
    where: { id: "demo-access-device-a" },
    create: {
      id: "demo-access-device-a",
      institutionId: aarav.institutionId,
      gateId: gate.id,
      name: "Main Gate Reader",
      secretHash,
      status: "ACTIVE",
    },
    update: { secretHash, gateId: gate.id, status: "ACTIVE" },
  });
  await prisma.studentCredential.upsert({
    where: { institutionId_uid: { institutionId: aarav.institutionId, uid: "KC-AARAV-RFID" } },
    create: {
      institutionId: aarav.institutionId,
      studentId: aarav.id,
      uid: "KC-AARAV-RFID",
      type: "RFID",
      status: "ACTIVE",
    },
    update: { studentId: aarav.id, status: "ACTIVE" },
  });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("SafeTrack movement authorization", () => {
  it("records device entry once, notifies the parent, and ignores a duplicate scan", async () => {
    const parent = await login("parent@example.test");
    const home = json<{ children: { id: string; firstName: string }[] }>(
      await app.inject({ method: "GET", url: "/dashboard/parent", headers: parent.headers }),
    );
    const aarav = home.children.find((c) => c.firstName === "Aarav")!;
    await prisma.notification.deleteMany({ where: { studentId: aarav.id, type: "MOVEMENT_ENTRY" } });
    await prisma.movementEvent.deleteMany({ where: { studentId: aarav.id } });

    const first = await ingestScan({
      deviceId: "demo-access-device-a",
      deviceSecret: "DemoDeviceSecret!",
      uid: "KC-AARAV-RFID",
      requestedType: "ENTRY",
      occurredAt: new Date("2026-09-05T08:02:00.000Z"),
    });
    expect(first.type).toBe("ENTRY");
    const dup = await ingestScan({
      deviceId: "demo-access-device-a",
      deviceSecret: "DemoDeviceSecret!",
      uid: "KC-AARAV-RFID",
      requestedType: "ENTRY",
      occurredAt: new Date("2026-09-05T08:02:20.000Z"),
    });
    expect(dup.type).toBe("DUPLICATE_SCAN");
    expect(
      await prisma.notification.count({
        where: { studentId: aarav.id, type: "MOVEMENT_ENTRY", userId: (await prisma.user.findFirst({ where: { email: "parent@example.test" } }))!.id },
      }),
    ).toBe(1);

    const list = await app.inject({ method: "GET", url: `/students/${aarav.id}/movement`, headers: parent.headers });
    expect(list.statusCode).toBe(200);
    const items = json<{ items: { type: string }[] }>(list).items;
    expect(items.filter((i) => i.type === "ENTRY")).toHaveLength(1);
  });

  it("404s a sibling student, unrelated parent, tenant B, and forbids teachers and super-admin", async () => {
    const parent = await login("parent@example.test");
    const student = await login("student@example.test");
    const teacher = await login("teacher@example.test");
    const superadmin = await login("superadmin@example.test");
    const parentB = await login("parent-b@example.test");
    const adminB = await login("admin-b@example.test");
    const home = json<{ children: { id: string; firstName: string }[] }>(
      await app.inject({ method: "GET", url: "/dashboard/parent", headers: parent.headers }),
    );
    const aarav = home.children.find((c) => c.firstName === "Aarav")!;
    const diya = home.children.find((c) => c.firstName === "Diya")!;

    expect((await app.inject({ method: "GET", url: `/students/${aarav.id}/movement`, headers: student.headers })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/students/${diya.id}/movement`, headers: parent.headers })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/students/${diya.id}/movement`, headers: student.headers })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/students/${aarav.id}/movement`, headers: teacher.headers })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: `/students/${aarav.id}/movement`, headers: superadmin.headers })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: `/students/${aarav.id}/movement`, headers: parentB.headers })).statusCode).toBe(404);

    const bStudents = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/students", headers: adminB.headers }));
    expect((await app.inject({ method: "GET", url: `/students/${bStudents[0]!.id}/movement`, headers: parent.headers })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/access/today", headers: parent.headers })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: `/students/${aarav.id}/movement` })).statusCode).toBe(401);
  });

  it("rejects a bad device secret and records an unknown card without notifying parents", async () => {
    const parentUser = await prisma.user.findFirst({ where: { email: "parent@example.test" } });
    const before = await prisma.notification.count({ where: { userId: parentUser!.id, type: "MOVEMENT_ENTRY" } });
    await expect(
      ingestScan({
        deviceId: "demo-access-device-a",
        deviceSecret: "wrong-secret",
        uid: "KC-AARAV-RFID",
      }),
    ).rejects.toThrow();
    const unknown = await ingestScan({
      deviceId: "demo-access-device-a",
      deviceSecret: "DemoDeviceSecret!",
      uid: `NO-SUCH-CARD-${Date.now()}`,
      occurredAt: new Date(),
    });
    expect(unknown.type).toBe("UNKNOWN_CARD");
    expect(await prisma.notification.count({ where: { userId: parentUser!.id, type: "MOVEMENT_ENTRY" } })).toBe(before);
  });
});
