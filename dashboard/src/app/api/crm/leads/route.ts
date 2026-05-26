import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const pipelineId = searchParams.get("pipelineId");
    const stageId = searchParams.get("stageId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const where: any = { userId: session.user.id };
    if (pipelineId) where.pipelineId = pipelineId;
    if (stageId) where.stageId = stageId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { contactName: { contains: search, mode: "insensitive" } },
        { contactEmail: { contains: search, mode: "insensitive" } },
        { contactPhone: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
      ];
    }

    const leads = await prisma.lead.findMany({
      where,
      include: {
        pipeline: true,
        stage: true,
        activities: { orderBy: { createdAt: "desc" }, take: 5 },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ leads });
  } catch (error) {
    console.error("GET /api/crm/leads error:", error);
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Auto-assign to first stage of pipeline if stage not specified
    let stageId = body.stageId;
    if (!stageId && body.pipelineId) {
      const firstStage = await prisma.pipelineStage.findFirst({
        where: { pipelineId: body.pipelineId },
        orderBy: { order: "asc" },
      });
      if (firstStage) stageId = firstStage.id;
    }

    const lead = await prisma.lead.create({
      data: {
        userId: session.user.id,
        pipelineId: body.pipelineId,
        stageId,
        contactName: body.contactName,
        contactPhone: body.contactPhone,
        contactEmail: body.contactEmail,
        company: body.company,
        title: body.title,
        source: body.source ?? "manual",
        score: body.score ?? 0,
        status: body.status ?? "new",
        notes: body.notes,
        tags: body.tags ?? [],
        customFields: body.customFields ?? {},
      },
      include: { pipeline: true, stage: true },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        leadId: lead.id,
        userId: session.user.id,
        type: "system",
        content: `Lead created from ${body.source || "manual"} source`,
        metadata: {},
      },
    });

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    console.error("POST /api/crm/leads error:", error);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const lead = await prisma.lead.findFirst({
      where: { id: body.id, userId: session.user.id },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Track stage changes for activity log
    const stageChanged = body.stageId && body.stageId !== lead.stageId;

    const updated = await prisma.lead.update({
      where: { id: body.id },
      data: {
        pipelineId: body.pipelineId,
        stageId: body.stageId,
        contactName: body.contactName,
        contactPhone: body.contactPhone,
        contactEmail: body.contactEmail,
        company: body.company,
        title: body.title,
        score: body.score,
        status: body.status,
        notes: body.notes,
        tags: body.tags,
        customFields: body.customFields,
        lastContactedAt: body.lastContactedAt ? new Date(body.lastContactedAt) : undefined,
      },
      include: { pipeline: true, stage: true },
    });

    if (stageChanged) {
      const oldStage = lead.stageId
        ? (await prisma.pipelineStage.findUnique({ where: { id: lead.stageId } }))?.name
        : "none";
      const newStage = body.stageId
        ? (await prisma.pipelineStage.findUnique({ where: { id: body.stageId } }))?.name
        : "none";
      await prisma.activityLog.create({
        data: {
          leadId: lead.id,
          userId: session.user.id,
          type: "system",
          content: `Moved from "${oldStage}" to "${newStage}"`,
          metadata: { fromStage: lead.stageId, toStage: body.stageId },
        },
      });
    }

    return NextResponse.json({ lead });
  } catch (error) {
    console.error("PUT /api/crm/leads error:", error);
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Lead ID required" }, { status: 400 });
    }

    const lead = await prisma.lead.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    await prisma.lead.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/crm/leads error:", error);
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 });
  }
}
