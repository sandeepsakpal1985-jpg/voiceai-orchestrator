import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { sendEmail, buildVerificationEmail } from "@/lib/email";

/**
 * POST /api/auth/verify-email
 * Sends a verification email to the user.
 * Body: { email }
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    if (user.emailVerified) {
      return NextResponse.json(
        { message: "Email is already verified" },
        { status: 200 }
      );
    }

    // Generate verification token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store token (reuse VerificationToken model with a unique identifier prefix)
    await prisma.verificationToken.create({
      data: {
        identifier: `verify:${user.id}`,
        token,
        expires: expiresAt,
      },
    });

    // Build verification URL
    const baseUrl = process.env.AUTH_URL ?? "http://localhost:3000";
    const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;

    // Send email
    const { html, text } = buildVerificationEmail({
      userName: user.name ?? "",
      verificationUrl,
    });

    await sendEmail({
      to: email,
      subject: "Verify your VoiceAI email address",
      html,
      text,
    });

    return NextResponse.json(
      { message: "Verification email sent" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Send verification error:", error);
    return NextResponse.json(
      { error: "Failed to send verification email" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/verify-email?token=xxx&email=yyy
 * Confirms the email verification token and marks user as verified.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const email = searchParams.get("email");

    if (!token || !email) {
      return new Response(
        `<html><body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb;">
          <div style="text-align: center; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 420px;">
            <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
            <h1 style="color: #18181b; margin: 0 0 8px;">Invalid verification link</h1>
            <p style="color: #71717a;">Missing verification parameters. Please request a new verification email.</p>
            <a href="/login" style="display: inline-block; margin-top: 20px; background: #4f46e5; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px;">Go to Login</a>
          </div>
        </body></html>`,
        {
          status: 400,
          headers: { "Content-Type": "text/html" },
        }
      );
    }

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return new Response(
        `<html><body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb;">
          <div style="text-align: center; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 420px;">
            <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
            <h1 style="color: #18181b; margin: 0 0 8px;">User not found</h1>
            <p style="color: #71717a;">No account found with this email address.</p>
            <a href="/register" style="display: inline-block; margin-top: 20px; background: #4f46e5; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px;">Create Account</a>
          </div>
        </body></html>`,
        {
          status: 404,
          headers: { "Content-Type": "text/html" },
        }
      );
    }

    if (user.emailVerified) {
      return new Response(
        `<html><body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb;">
          <div style="text-align: center; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 420px;">
            <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
            <h1 style="color: #18181b; margin: 0 0 8px;">Already verified</h1>
            <p style="color: #71717a;">Your email is already verified. You can sign in below.</p>
            <a href="/login" style="display: inline-block; margin-top: 20px; background: #4f46e5; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px;">Sign In</a>
          </div>
        </body></html>`,
        {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }
      );
    }

    // Find and validate token
    const storedToken = await prisma.verificationToken.findFirst({
      where: {
        identifier: `verify:${user.id}`,
        token,
        expires: { gte: new Date() },
      },
    });

    if (!storedToken) {
      return new Response(
        `<html><body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb;">
          <div style="text-align: center; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 420px;">
            <div style="font-size: 48px; margin-bottom: 16px;">⏰</div>
            <h1 style="color: #18181b; margin: 0 0 8px;">Link expired or invalid</h1>
            <p style="color: #71717a;">This verification link has expired or is invalid. Please request a new one.</p>
            <a href="/login" style="display: inline-block; margin-top: 20px; background: #4f46e5; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px;">Go to Login</a>
          </div>
        </body></html>`,
        {
          status: 400,
          headers: { "Content-Type": "text/html" },
        }
      );
    }

    // Mark email as verified
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    });

    // Delete the used token
    await prisma.verificationToken.delete({
      where: { token: storedToken.token },
    });

    // Delete any other verification tokens for this user
    await prisma.verificationToken.deleteMany({
      where: { identifier: `verify:${user.id}` },
    });

    return new Response(
      `<html><body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb;">
        <div style="text-align: center; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 420px;">
          <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
          <h1 style="color: #18181b; margin: 0 0 8px;">Email verified!</h1>
          <p style="color: #71717a;">Your email has been successfully verified. You can now sign in to your account.</p>
          <a href="/login" style="display: inline-block; margin-top: 20px; background: #4f46e5; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px;">Sign In</a>
        </div>
      </body></html>`,
      {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }
    );
  } catch (error) {
    console.error("Verify email error:", error);
    return new Response(
      `<html><body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb;">
        <div style="text-align: center; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 420px;">
          <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <h1 style="color: #18181b; margin: 0 0 8px;">Something went wrong</h1>
          <p style="color: #71717a;">An error occurred while verifying your email. Please try again or request a new verification link.</p>
          <a href="/login" style="display: inline-block; margin-top: 20px; background: #4f46e5; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px;">Go to Login</a>
        </div>
      </body></html>`,
      {
        status: 500,
        headers: { "Content-Type": "text/html" },
      }
    );
  }
}
