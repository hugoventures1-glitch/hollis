"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import { useHollisStore, HOLLIS_STALE_MS } from "@/stores/hollisStore";
import { daysUntilExpiry } from "@/types/renewals";
import {
  Activity,
  RefreshCcw,
  Users,
  Settings,
  LogOut,
  User,
  Search,
  Inbox,
  FolderSearch,
  Sun,
  Moon,
} from "lucide-react";
import { useUnifiedPanel } from "@/contexts/UnifiedPanelContext";

interface SidebarProfile {
  firstName:  string | null;
  lastName:   string | null;
  agencyName: string | null;
  email:      string | null;
}

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
      className="relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 hover:scale-[1.15]"
      style={{
        color:      active ? "var(--text-primary)" : "var(--text-tertiary)",
        background: active ? "var(--border)" : "transparent",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        if (!active) el.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        if (!active) el.style.color = "var(--text-tertiary)";
      }}
    >
      <Icon size={19} strokeWidth={1.6} />
      {!!badge && badge > 0 && (
        <span
          className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--danger)" }}
        />
      )}
    </Link>
  );
}

export default function SidebarNav({ profile }: { profile: SidebarProfile }) {
  const pathname   = usePathname();
  const router     = useRouter();
  const { openPanel } = useUnifiedPanel();
  const { theme, setTheme } = useTheme();

  const approvalQueueCount = useHollisStore(s => s.approvalQueueCount);

  const renewalCount = useHollisStore(s =>
    s.policies.filter(p => { const d = daysUntilExpiry(p.expiration_date); return d >= 0 && d <= 60; }).length
  );

  const docChaseCount = useHollisStore(s =>
    s.docChaseRequests.filter(r => r.status === "active").length
  );

  const first    = profile.firstName?.[0] ?? "";
  const last     = profile.lastName?.[0]  ?? "";
  const initials = (first + last).toUpperCase() || "H";
  const agencyName = profile.agencyName;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

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
      style={{ width: 72, background: "var(--background)", borderRight: "1px solid var(--border-subtle)" }}
      className="flex flex-col shrink-0"
      onMouseEnter={handleNavHover}
    >
      {/* Wordmark */}
      <div
        className="flex items-center justify-center h-14 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <Link href="/inbox">
          <span
            style={{
              fontFamily:    "var(--font-playfair)",
              fontWeight:    900,
              fontSize:      18,
              color:         "var(--text-primary)",
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
        {/* Search — opens assistant panel */}
        <button
          onClick={openPanel}
          title="Search"
          className="relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 hover:scale-[1.15]"
          style={{ color: "var(--text-tertiary)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)";
          }}
        >
          <Search size={19} strokeWidth={1.6} />
        </button>

        <RailIcon href="/inbox"     icon={Inbox}           label="Inbox"    pathname={pathname} badge={approvalQueueCount} />
        <RailIcon href="/activity"  icon={Activity}        label="Activity" pathname={pathname} />
        <RailIcon href="/renewals"   icon={RefreshCcw}      label="Renewals"   pathname={pathname} badge={renewalCount} />
        <RailIcon href="/documents" icon={FolderSearch}    label="Documents"  pathname={pathname} badge={docChaseCount} />
        <RailIcon href="/clients"   icon={Users}           label="Clients"    pathname={pathname} />
        <RailIcon href="/settings"  icon={Settings}        label="Settings" pathname={pathname} />
      </nav>

      {/* User avatar / profile menu */}
      <div
        ref={menuRef}
        className="relative flex items-center justify-center h-14 shrink-0"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        {/* Pop-up menu */}
        {menuOpen && (
          <div
            className="absolute bottom-[calc(100%+8px)] left-full ml-2 z-50 rounded-xl overflow-hidden"
            style={{
              width: 200,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)",
            }}
          >
            {/* Identity header */}
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                {agencyName ?? "My Agency"}
              </div>
              {profile.email && (
                <div
                  className="text-[11px] mt-0.5 truncate"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {profile.email}
                </div>
              )}
            </div>

            {/* Nav items */}
            <div className="py-1.5">
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-[12px] transition-colors hover-text-primary"
                style={{ color: "var(--text-secondary)" }}
              >
                <Settings size={13} strokeWidth={1.6} />
                Settings
              </Link>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-[12px] transition-colors hover-text-primary"
                style={{ color: "var(--text-secondary)" }}
              >
                <User size={13} strokeWidth={1.6} />
                Profile
              </Link>
            </div>

            {/* Theme toggle — subtle, between nav items and sign out */}
            <div className="py-1.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-[12px] transition-colors hover-text-primary"
                style={{ color: "var(--text-secondary)" }}
              >
                {theme === "dark"
                  ? <Sun size={13} strokeWidth={1.6} />
                  : <Moon size={13} strokeWidth={1.6} />
                }
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </button>
            </div>

            {/* Sign out */}
            <div className="py-1.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-[12px] transition-colors hover-text-danger"
                style={{ color: "var(--text-secondary)" }}
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
          className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold transition-colors"
          style={{
            background: menuOpen ? "var(--border)" : "var(--surface-raised)",
            color:      menuOpen ? "var(--text-primary)" : "var(--text-secondary)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--border)";
            (e.currentTarget as HTMLElement).style.color      = "var(--text-secondary)";
          }}
          onMouseLeave={(e) => {
            if (!menuOpen) {
              (e.currentTarget as HTMLElement).style.background = "var(--surface-raised)";
              (e.currentTarget as HTMLElement).style.color      = "var(--text-secondary)";
            }
          }}
        >
          {initials}
        </button>
      </div>
    </aside>
  );
}
