import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that never require authentication
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/api/auth",
  // COI public portal (client-facing, no login needed)
  "/certificates/request",
  "/api/coi/request",
  "/api/coi/agent-info",
  // Cron jobs — protected by CRON_SECRET header inside the route handler
  "/api/cron",
  // Webhook from Resend — validated by RESEND_WEBHOOK_SECRET inside the route handler
  "/api/webhooks/resend",
  // Holder follow-up cron — protected by CRON_SECRET header inside the route handler
  "/api/holder-followup/process",
];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — reads from cookie, no network call, avoids rate-limiting.
  // Individual API routes and server components call getUser() for server-side
  // verification when they actually need it.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );

  // No session on any protected route → /login
  if (!session && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Authenticated user on an auth page → /overview
  if (session && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/overview";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
