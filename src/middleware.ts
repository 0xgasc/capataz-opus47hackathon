import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  if (!req.cookies.get("cap_session")) {
    res.cookies.set("cap_session", crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 90, // 90 days
      path: "/",
    });
  }
  return res;
}
