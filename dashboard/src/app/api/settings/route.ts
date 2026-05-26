import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [user, apiKeys] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          companyName: true,
          phone: true,
          timezone: true,
          image: true,
          role: true,
        },
      }),
      prisma.apiKey.findMany({
        where: { userId: session.user.id, active: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({ user, apiKeys });
  } catch (error) {
    console.error("GET /api/settings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: body.name,
        companyName: body.companyName,
        phone: body.phone,
        timezone: body.timezone,
      },
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error("PUT /api/settings error:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
