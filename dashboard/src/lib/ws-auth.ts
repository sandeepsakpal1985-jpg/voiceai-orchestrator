/**
 * WebSocket Auth — JWT token utilities
 *
 * The client obtains a short-lived JWT from GET /api/ws-token and sends it
 * to the WebSocket server as { type: "auth", token: "..." }.
 *
 * The WS server verifies the token using the AUTH_SECRET and extracts the userId.
 */
import { SignJWT, jwtVerify } from "jose";

const ALGORITHM = "HS256";
const TOKEN_EXPIRY = "5m"; // Short-lived tokens

/**
 * Get the JWT secret key for signing/verifying tokens.
 */
function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is required");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Create a short-lived JWT token for WebSocket authentication.
 *
 * @param userId - The user ID to embed in the token
 * @returns A signed JWT string
 */
export async function createWsToken(userId: string): Promise<string> {
  const secret = getSecret();

  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .setSubject(userId)
    .sign(secret);

  return token;
}

/**
 * Verify a WebSocket JWT token and extract the userId.
 *
 * @param token - The JWT string to verify
 * @returns The userId (sub claim) if valid, or null if invalid/expired
 */
export async function verifyWsToken(token: string): Promise<string | null> {
  try {
    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [ALGORITHM],
    });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
