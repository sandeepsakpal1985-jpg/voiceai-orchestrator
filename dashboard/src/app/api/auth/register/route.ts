import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { sendEmail, buildVerificationEmail } from "@/lib/email";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const { name, email, companyName, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        companyName,
        passwordHash,
      },
    });

    // Create a trial subscription
    const trialPlan = await prisma.plan.findFirst({
      where: { name: "Starter" },
    });

    if (trialPlan) {
      await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: trialPlan.id,
          status: "TRIALING",
          currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          trialEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // Send verification email (non-blocking — fire and forget)
    try {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await prisma.verificationToken.create({
        data: {
          identifier: `verify:${user.id}`,
          token,
          expires: expiresAt,
        },
      });

      const baseUrl = process.env.AUTH_URL ?? "http://localhost:3000";
      const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(user.email ?? "")}`;

      const { html, text } = buildVerificationEmail({
        userName: user.name ?? "",
        verificationUrl,
      });

      await sendEmail({
        to: user.email!,
        subject: "Verify your VoiceAI email address",
        html,
        text,
      });
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError);
      // Don't block registration — verification can be triggered later
    }

    return NextResponse.json(
      { message: "Account created successfully. Please check your email to verify your account.", userId: user.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
