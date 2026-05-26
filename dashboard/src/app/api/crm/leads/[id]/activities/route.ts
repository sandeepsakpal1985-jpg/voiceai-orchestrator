import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activities = await prisma.activityLog.findMany({
      where: { leadId: id, lead: { userId: session.user.id } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ activities });
  } catch (error) {
    console.error("GET /api/crm/leads/[id]/activities error:", error);
    return NextResponse.json({ error: "Failed to fetch activities" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const lead = await prisma.lead.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const activity = await prisma.activityLog.create({
      data: {
        leadId: id,
        userId: session.user.id,
        type: body.type ?? "note",
        content: body.content,
        metadata: body.metadata ?? {},
      },
    });

    // Update last contacted time for call/email/meeting types
    if (["call", "email", "meeting", "sms", "social"].includes(body.type)) {
      await prisma.lead.update({
        where: { id },
        data: { lastContactedAt: new Date() },
      });
    }

    return NextResponse.json({ activity }, { status: 201 });
  } catch (error) {
    console.error("POST /api/crm/leads/[id]/activities error:", error);
    return NextResponse.json({ error: "Failed to log activity" }, { status: 500 });
  }
}
