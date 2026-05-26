/**
 * Organization API Routes
 *
 * CRUD operations for organizations, workspaces, and members.
 * Multi-tenant management for the VoiceAI platform.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

// ── Helpers ──

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

// ── GET /api/organizations — List user's organizations ──

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizations = await prisma.organization.findMany({
      where: {
        members: {
          some: { userId: session.user.id },
        },
      },
      include: {
        _count: { select: { members: true, workspaces: true } },
        members: {
          where: { userId: session.user.id },
          select: { role: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ organizations });
  } catch (error) {
    console.error("Failed to fetch organizations:", error);
    return NextResponse.json(
      { error: "Failed to fetch organizations" },
      { status: 500 }
    );
  }
}

// ── POST /api/organizations — Create a new organization ──

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, slug, description } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Organization name is required" },
        { status: 400 }
      );
    }

    const orgSlug = slug || generateSlug(name);

    // Check slug uniqueness
    const existing = await prisma.organization.findUnique({
      where: { slug: orgSlug },
    });
    if (existing) {
      return NextResponse.json(
        { error: "An organization with this slug already exists" },
        { status: 409 }
      );
    }

    // Create organization with the creator as OWNER
    const organization = await prisma.organization.create({
      data: {
        name: name.trim(),
        slug: orgSlug,
        description,
        members: {
          create: {
            userId: session.user.id,
            role: "OWNER",
            joinedAt: new Date(),
          },
        },
        workspaces: {
          create: {
            name: "Default Workspace",
            slug: "default",
            description: "Default workspace for the organization",
          },
        },
        users: {
          connect: { id: session.user.id },
        },
      },
      include: {
        _count: { select: { members: true, workspaces: true } },
      },
    });

    // Update user's organization
    await prisma.user.update({
      where: { id: session.user.id },
      data: { organizationId: organization.id },
    });

    return NextResponse.json(
      { organization },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create organization:", error);
    return NextResponse.json(
      { error: "Failed to create organization" },
      { status: 500 }
    );
  }
}

// ── PATCH /api/organizations — Update organization settings ──

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { organizationId, name, slug, description, logo, website, timezone, settings } = body;

    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required" },
        { status: 400 }
      );
    }

    // Verify user has admin access
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: session.user.id,
        },
      },
    });

    if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // If slug is changing, check uniqueness
    if (slug) {
      const existing = await prisma.organization.findFirst({
        where: { slug, id: { not: organizationId } },
      });
      if (existing) {
        return NextResponse.json(
          { error: "An organization with this slug already exists" },
          { status: 409 }
        );
      }
    }

    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(name && { name }),
        ...(slug && { slug }),
        ...(description !== undefined && { description }),
        ...(logo !== undefined && { logo }),
        ...(website !== undefined && { website }),
        ...(timezone && { timezone }),
        ...(settings && { settings }),
      },
    });

    return NextResponse.json({ organization });
  } catch (error) {
    console.error("Failed to update organization:", error);
    return NextResponse.json(
      { error: "Failed to update organization" },
      { status: 500 }
    );
  }
}

// ── DELETE /api/organizations — Delete organization ──

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("id");

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 }
      );
    }

    // Verify user is OWNER
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: session.user.id,
        },
      },
    });

    if (!membership || membership.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only the organization owner can delete it" },
        { status: 403 }
      );
    }

    await prisma.organization.delete({
      where: { id: organizationId },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Failed to delete organization:", error);
    return NextResponse.json(
      { error: "Failed to delete organization" },
      { status: 500 }
    );
  }
}
