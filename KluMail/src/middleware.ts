import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = [/^\/dashboard/, /^\/inbox/, /^\/tickets/, /^\/customers/, /^\/users/, /^\/teams/, /^\/mailboxes/, /^\/settings/, /^\/notifications/, /^\/reports/, /^\/profile/, /^\/onboarding/];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get("klumail_session")?.value);
  if (PROTECTED.some((pattern) => pattern.test(pathname)) && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
