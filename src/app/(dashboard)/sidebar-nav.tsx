"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSidebarCounts } from "@/hooks/useSidebarCounts";
import { useHollisStore, HOLLIS_STALE_MS } from "@/stores/hollisStore";
import {
  LayoutDashboard,
  Activity,
  RefreshCcw,
  Users,
  Award,
  ClipboardCheck,
  FileText,
  Settings,
  LogOut,
  User,
  Search,
} from "lucide-react";
import { useUnifiedPanel } from "@/contexts/UnifiedPanelContext";

interface RailIconProps {
  href: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
  pathname: string;
}

function RailIcon({ href, icon: Icon, label, badge, pathname }: RailIconProps) {
  const active =
    href === "/overview"
      ? pathname === "/overview"
      : href === "/certificates"
      ? pathname === "/certificates" || pathname.startsWith("/certificates/")
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      title={label}
      className="relative flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200"
      style={{
        color:      active ? "#FAFAFA" : "#484848",
        background: active ? "#1C1C1C" : "transparent",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        if (!active) el.style.color = "#FAFAFA";
        el.style.transform = "scale(1.15)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        if (!active) el.style.color = "#484848";
        el.style.transform = "scale(1)";
      }}
    >
      <Icon size={17} strokeWidth={1.6} />
      {!!badge && badge > 0 && (
        <span
          className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
          style={{ background: "#FF4444" }}
        />
      )}
    </Link>
  );
}

export default function SidebarNav() {
  const pathname   = usePathname();
  const router     = useRouter();
  const counts     = useSidebarCounts();
  const { openPanel } = useUnifiedPanel();

  const [initials,   setInitials]   = useState<string>("H");
  const [agencyName, setAgencyName] = useState<string | null>(null);
  const [email,      setEmail]      = useState<string | null>(null);
  const [menuOpen,   setMenuOpen]   = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setEmail(user.email ?? null);
      Promise.all([
        supabase
          .from("agent_profiles")
          .select("agency_name, first_name, last_name")
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

        const first = profileRes.data?.first_name?.[0] ?? "";
        const last  = profileRes.data?.last_name?.[0]  ?? "";
        setInitials((first + last).toUpperCase() || "H");
      });
    });
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleNavHover = () => {
    const { lastFetched, fetchAll } = useHollisStore.getState();
    if (!lastFetched || Date.now() - lastFetched > HOLLIS_STALE_MS) {
      fetchAll();
    }
  };

  return (
    <aside
      style={{ width: 68 }}
      className="flex flex-col shrink-0"
      onMouseEnter={handleNavHover}
    >
      {/* Wordmark */}
      <div
        className="flex items-center justify-center h-14 shrink-0"
        style={{ borderBottom: "1px solid #181818" }}
      >
        <Link href="/overview">
          <span
            style={{
              fontFamily:    "var(--font-playfair)",
              fontWeight:    900,
              fontSize:      16,
              color:         "#FAFAFA",
              letterSpacing: "-0.02em",
              lineHeight:    1,
            }}
          >
            h
          </span>
        </Link>
      </div>

      {/* Icon nav rail */}
      <nav className="flex-1 flex flex-col items-center py-3 gap-1 overflow-y-auto">
        <RailIcon href="/overview"     icon={LayoutDashboard} label="Overview"     pathname={pathname} />
        <RailIcon href="/activity"     icon={Activity}        label="Activity"     pathname={pathname} />
        <RailIcon href="/renewals"     icon={RefreshCcw}      label="Renewals"     pathname={pathname} badge={counts.renewals} />
        <RailIcon href="/clients"      icon={Users}           label="Clients"      pathname={pathname} />
        <RailIcon href="/certificates" icon={Award}           label="Certificates" pathname={pathname} badge={counts.coi} />
        <RailIcon href="/review"       icon={ClipboardCheck}  label="Review"       pathname={pathname} badge={counts.review} />
        <RailIcon href="/documents"    icon={FileText}        label="Documents"    pathname={pathname} badge={counts.docChase} />
        {/* Search — opens assistant panel */}
        <button
          onClick={openPanel}
          title="Search"
          className="relative flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200"
          style={{ color: "#484848" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color     = "#FAFAFA";
            (e.currentTarget as HTMLElement).style.transform = "scale(1.15)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color     = "#484848";
            (e.currentTarget as HTMLElement).style.transform = "scale(1)";
          }}
        >
          <Search size={17} strokeWidth={1.6} />
        </button>

        <RailIcon href="/settings" icon={Settings} label="Settings" pathname={pathname} />
      </nav>

      {/* User avatar / profile menu */}
      <div
        ref={menuRef}
        className="relative flex items-center justify-center h-14 shrink-0"
        style={{ borderTop: "1px solid #181818" }}
      >
        {/* Pop-up menu */}
        {menuOpen && (
          <div
            className="absolute bottom-[calc(100%+8px)] left-full ml-2 z-50 rounded-xl overflow-hidden"
            style={{
              width: 200,
              background: "#111111",
              border: "1px solid #222222",
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            }}
          >
            {/* Identity header */}
            <div className="px-4 py-3" style={{ borderBottom: "1px solid #1E1E1E" }}>
              <div className="text-[12px] font-semibold" style={{ color: "#FAFAFA" }}>
                {agencyName ?? "My Agency"}
              </div>
              {email && (
                <div
                  className="text-[11px] mt-0.5 truncate"
                  style={{ color: "#555" }}
                >
                  {email}
                </div>
              )}
            </div>

            {/* Nav items */}
            <div className="py-1.5">
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-[12px] transition-colors"
                style={{ color: "#888" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#FAFAFA")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#888")}
              >
                <Settings size={13} strokeWidth={1.6} />
                Settings
              </Link>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-[12px] transition-colors"
                style={{ color: "#888" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#FAFAFA")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#888")}
              >
                <User size={13} strokeWidth={1.6} />
                Profile
              </Link>
            </div>

            {/* Sign out */}
            <div className="py-1.5" style={{ borderTop: "1px solid #1E1E1E" }}>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-[12px] transition-colors"
                style={{ color: "#555" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#FF4444")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
              >
                <LogOut size={13} strokeWidth={1.6} />
                Sign out
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => setMenuOpen((o) => !o)}
          title={agencyName ?? "Account"}
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold transition-colors"
          style={{
            background: menuOpen ? "#2A2A2A" : "#1C1C1C",
            color:      menuOpen ? "#FAFAFA" : "#666666",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#2A2A2A";
            (e.currentTarget as HTMLElement).style.color      = "#999999";
          }}
          onMouseLeave={(e) => {
            if (!menuOpen) {
              (e.currentTarget as HTMLElement).style.background = "#1C1C1C";
              (e.currentTarget as HTMLElement).style.color      = "#666666";
            }
          }}
        >
          {initials}
        </button>
      </div>
    </aside>
  );
}
