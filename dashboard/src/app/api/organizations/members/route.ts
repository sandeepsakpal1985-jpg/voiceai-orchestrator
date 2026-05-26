/**
 * Organization Members API Routes
 *
 * Manage members within an organization:
 *   GET    /api/organizations/members?organizationId=xxx
 *   POST   /api/organizations/members (invite a member)
 *   PATCH  /api/organizations/members (update member role)
 *   DELETE /api/organizations/members?organizationId=xxx&userId=yyy
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

// ── GET — List organization members ──

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

    // Verify user is a member of this organization
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

    const members = await prisma.organizationMember.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          },
        },
      },
      orderBy: [
        { role: "asc" },
        { joinedAt: "asc" },
      ],
    });

    return NextResponse.json({ members });
  } catch (error) {
    console.error("Failed to fetch members:", error);
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}

// ── POST — Invite a member (by email) ──

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { organizationId, email, role = "MEMBER" } = body;

    if (!organizationId || !email) {
      return NextResponse.json(
        { error: "organizationId and email are required" },
        { status: 400 }
      );
    }

    // Verify inviter has admin/owner permissions
    const inviterMembership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: session.user.id,
        },
      },
    });

    if (
      !inviterMembership ||
      (inviterMembership.role !== "OWNER" && inviterMembership.role !== "ADMIN")
    ) {
      return NextResponse.json(
        { error: "Insufficient permissions to invite members" },
        { status: 403 }
      );
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "No user found with this email address" },
        { status: 404 }
      );
    }

    // Check if already a member
    const existing = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: user.id,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "User is already a member of this organization" },
        { status: 409 }
      );
    }

    // Get the max number of seats from the organization's subscription plan
    const subscription = await prisma.subscription.findFirst({
      where: { organizationId },
      include: { plan: true },
    });

    const maxSeats = subscription?.plan?.teamSeats ?? 5;

    // Count current members
    const memberCount = await prisma.organizationMember.count({
      where: { organizationId },
    });

    if (memberCount >= maxSeats) {
      return NextResponse.json(
        {
          error: `Organization has reached its member limit (${maxSeats}). Upgrade your plan to add more members.`,
        },
        { status: 403 }
      );
    }

    // Add member
    const member = await prisma.organizationMember.create({
      data: {
        organizationId,
        userId: user.id,
        role: role as "OWNER" | "ADMIN" | "MEMBER" | "VIEWER",
        invitedBy: session.user.id,
        joinedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    // Link user to organization if not already linked
    if (!user.organizationId) {
      await prisma.user.update({
        where: { id: user.id },
        data: { organizationId },
      });
    }

    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    console.error("Failed to invite member:", error);
    return NextResponse.json(
      { error: "Failed to invite member" },
      { status: 500 }
    );
  }
}

// ── PATCH — Update member role ──

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { organizationId, userId, role } = body;

    if (!organizationId || !userId || !role) {
      return NextResponse.json(
        { error: "organizationId, userId, and role are required" },
        { status: 400 }
      );
    }

    // Verify requester is OWNER or ADMIN
    const requesterMembership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: session.user.id,
        },
      },
    });

    if (
      !requesterMembership ||
      (requesterMembership.role !== "OWNER" && requesterMembership.role !== "ADMIN")
    ) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Only OWNER can promote to OWNER
    if (role === "OWNER" && requesterMembership.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only the organization owner can assign the owner role" },
        { status: 403 }
      );
    }

    const member = await prisma.organizationMember.update({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
      data: { role: role as "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    return NextResponse.json({ member });
  } catch (error) {
    console.error("Failed to update member role:", error);
    return NextResponse.json(
      { error: "Failed to update member role" },
      { status: 500 }
    );
  }
}

// ── DELETE — Remove a member ──

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");
    const userId = searchParams.get("userId");

    if (!organizationId || !userId) {
      return NextResponse.json(
        { error: "organizationId and userId are required" },
        { status: 400 }
      );
    }

    // Verify requester has admin/owner permissions (or is removing themselves)
    const requesterMembership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: session.user.id,
        },
      },
    });

    const isSelfRemoval = userId === session.user.id;

    if (!isSelfRemoval) {
      if (
        !requesterMembership ||
        (requesterMembership.role !== "OWNER" && requesterMembership.role !== "ADMIN")
      ) {
        return NextResponse.json(
          { error: "Insufficient permissions" },
          { status: 403 }
        );
      }
    }

    // Cannot remove the last OWNER
    const targetMembership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
    });

    if (targetMembership?.role === "OWNER") {
      const ownerCount = await prisma.organizationMember.count({
        where: { organizationId, role: "OWNER" },
      });
      if (ownerCount <= 1 && !isSelfRemoval) {
        return NextResponse.json(
          { error: "Cannot remove the last owner. Transfer ownership first." },
          { status: 403 }
        );
      }
    }

    await prisma.organizationMember.delete({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
    });

    return NextResponse.json({ removed: true });
  } catch (error) {
    console.error("Failed to remove member:", error);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}
