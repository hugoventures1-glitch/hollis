"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSidebarCounts } from "@/hooks/useSidebarCounts";
import { useHollisStore, HOLLIS_STALE_MS } from "@/stores/hollisStore";

interface RailItemProps {
  href: string;
  label: string;
  badge?: number;
  pathname: string;
}

function RailItem({ href, label, badge, pathname }: RailItemProps) {
  const active =
    href === "/overview"
      ? pathname === "/overview"
      : href === "/certificates"
      ? pathname === "/certificates" || pathname.startsWith("/certificates/")
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className="relative flex items-center justify-center w-full h-9 transition-colors"
      style={{ color: active ? "#FAFAFA" : "#333333" }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.color = "#555555";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.color = "#333333";
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          lineHeight: 1,
        }}
      >
        {label}
      </span>
      {badge && badge > 0 && (
        <span
          className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full"
          style={{ background: "#FF4444" }}
        />
      )}
    </Link>
  );
}

export default function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const counts = useSidebarCounts();

  const [agencyName, setAgencyName] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      Promise.all([
        supabase
          .from("agent_profiles")
          .select("agency_name")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("agencies")
          .select("name")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]).then(([profileRes, agencyRes]) => {
        const name =
          profileRes.data?.agency_name ?? agencyRes.data?.name ?? null;
        setAgencyName(name);
      });
    });
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleNavHover = () => {
    const { lastFetched, fetchAll } = useHollisStore.getState();
    if (!lastFetched || Date.now() - lastFetched > HOLLIS_STALE_MS) {
      fetchAll();
    }
  };

  return (
    <aside
      style={{ width: 56 }}
      className="flex flex-col shrink-0"
      onMouseEnter={handleNavHover}
    >
      {/* Wordmark */}
      <div
        className="flex items-center justify-center h-14 shrink-0"
        style={{ borderBottom: "1px solid #1C1C1C" }}
      >
        <Link href="/overview">
          <span
            style={{
              fontFamily: "var(--font-playfair)",
              fontWeight: 900,
              fontSize: 16,
              color: "#FAFAFA",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            h
          </span>
        </Link>
      </div>

      {/* Nav rail */}
      <nav className="flex-1 flex flex-col items-center py-3 gap-0.5 overflow-y-auto">
        <RailItem href="/overview"      label="over"   pathname={pathname} />
        <RailItem href="/activity"      label="feed"   pathname={pathname} />
        <RailItem href="/renewals"      label="renew"  pathname={pathname} badge={counts.renewals} />
        <RailItem href="/clients"       label="client" pathname={pathname} />
        <RailItem href="/certificates"  label="certs"  pathname={pathname} badge={counts.coi} />
        <RailItem href="/review"        label="review" pathname={pathname} badge={counts.review} />
        <RailItem href="/documents"     label="docs"   pathname={pathname} badge={counts.docChase} />
        <RailItem href="/settings"      label="set"    pathname={pathname} />
      </nav>

      {/* Sign-out */}
      <div
        className="flex items-center justify-center h-14 shrink-0"
        style={{ borderTop: "1px solid #1C1C1C" }}
      >
        <button
          onClick={handleSignOut}
          title={agencyName ?? "Sign out"}
          className="w-6 h-6 rounded-full transition-colors"
          style={{ background: "#1C1C1C" }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.background = "#333333")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = "#1C1C1C")
          }
        />
      </div>
    </aside>
  );
}
