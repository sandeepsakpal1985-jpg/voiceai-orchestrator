import { compare, hash } from "bcryptjs";

const POLICY = /^(?=.*[A-Za-z])(?=.*\d).{10,}$/;

export function passwordIsAcceptable(password: string): boolean {
  return POLICY.test(password);
}

export function passwordHint(): string {
  return "Use at least 10 characters with one letter and one number.";
}

export async function hashPassword(password: string): Promise<string> {
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? "12");
  return hash(password, Number.isFinite(rounds) ? rounds : 12);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}

let dummyHash: string | null = null;

export async function consumeDummyPasswordCheck(password: string): Promise<void> {
  dummyHash ??= await hash("klumail-dummy-password", 4);
  await compare(password, dummyHash);
}
