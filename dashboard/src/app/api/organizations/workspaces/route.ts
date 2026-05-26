/**
 * Workspace API Routes
 *
 * Manage workspaces within an organization:
 *   GET    /api/organizations/workspaces?organizationId=xxx
 *   POST   /api/organizations/workspaces
 *   PATCH  /api/organizations/workspaces
 *   DELETE /api/organizations/workspaces?id=xxx
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

// ── GET — List workspaces ──

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required" },
        { status: 400 }
      );
    }

    // Verify user is a member
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: session.user.id,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const workspaces = await prisma.workspace.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ workspaces });
  } catch (error) {
    console.error("Failed to fetch workspaces:", error);
    return NextResponse.json(
      { error: "Failed to fetch workspaces" },
      { status: 500 }
    );
  }
}

// ── POST — Create workspace ──

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { organizationId, name, description } = body;

    if (!organizationId || !name) {
      return NextResponse.json(
        { error: "organizationId and name are required" },
        { status: 400 }
      );
    }

    // Verify user has admin/owner permissions
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: session.user.id,
        },
      },
    });

    if (
      !membership ||
      (membership.role !== "OWNER" && membership.role !== "ADMIN")
    ) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const slug = generateSlug(name);

    const workspace = await prisma.workspace.create({
      data: {
        organizationId,
        name,
        slug,
        description,
      },
    });

    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    console.error("Failed to create workspace:", error);
    return NextResponse.json(
      { error: "Failed to create workspace" },
      { status: 500 }
    );
  }
}

// ── PATCH — Update workspace ──

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, description, settings } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Workspace id is required" },
        { status: 400 }
      );
    }

    // Get workspace to verify org permissions
    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: { organization: true },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Verify user has admin/owner permissions
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: workspace.organizationId,
          userId: session.user.id,
        },
      },
    });

    if (
      !membership ||
      (membership.role !== "OWNER" && membership.role !== "ADMIN")
    ) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const updated = await prisma.workspace.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(name && { slug: generateSlug(name) }),
        ...(description !== undefined && { description }),
        ...(settings && { settings }),
      },
    });

    return NextResponse.json({ workspace: updated });
  } catch (error) {
    console.error("Failed to update workspace:", error);
    return NextResponse.json(
      { error: "Failed to update workspace" },
      { status: 500 }
    );
  }
}

// ── DELETE — Remove workspace ──

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Workspace id is required" },
        { status: 400 }
      );
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: { organization: true },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Verify user is OWNER
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: workspace.organizationId,
          userId: session.user.id,
        },
      },
    });

    if (!membership || membership.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only the organization owner can delete workspaces" },
        { status: 403 }
      );
    }

    // Don't allow deleting the last workspace
    const workspaceCount = await prisma.workspace.count({
      where: { organizationId: workspace.organizationId },
    });

    if (workspaceCount <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last workspace" },
        { status: 400 }
      );
    }

    await prisma.workspace.delete({
      where: { id },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Failed to delete workspace:", error);
    return NextResponse.json(
      { error: "Failed to delete workspace" },
      { status: 500 }
    );
  }
}
