"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Zap,
  Search,
  Send,
  Inbox,
  LayoutGrid,
  RefreshCw,
  ShieldCheck,
  Layers,
  Users,
  ClipboardCheck,
  ChevronDown,
  LogOut,
  Mail,
  Upload,
} from "lucide-react";
import SearchModal from "@/components/search/SearchModal";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 mb-1 mt-6">
      <span className="text-[12px] font-semibold text-[#3a3a42] uppercase tracking-[0.1em]">
        {children}
      </span>
    </div>
  );
}

interface NavItemProps {
  href: string;
  icon: React.ElementType;
  label: string;
  badge?: string;
  pathname: string;
}

function NavItem({ href, icon: Icon, label, badge, pathname }: NavItemProps) {
  const active =
    href === "/overview"
      ? pathname === "/overview"
      // Exact match, OR starts with href + "/" — but exclude deeper fixed sub-routes
      // that have their own nav item (e.g. /certificates/sequences vs /certificates)
      : href === "/certificates"
      ? pathname === "/certificates" ||
        (pathname.startsWith("/certificates/") &&
          !pathname.startsWith("/certificates/sequences"))
      : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`w-full flex items-center justify-between px-2.5 py-[9px] rounded-[4px] transition-colors group ${
        active
          ? "bg-[rgba(255,255,255,0.06)] text-[#f5f5f7]"
          : "text-[#8a8b91] hover:bg-white/[0.04] hover:text-[#f5f5f7]"
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon
          size={18}
          strokeWidth={active ? 2 : 1.5}
          className={
            active
              ? "text-[#00d4aa]"
              : "text-[#8a8b91] group-hover:text-[#f5f5f7] transition-colors"
          }
        />
        <span className="text-[15px] font-medium leading-none tracking-tight">
          {label}
        </span>
      </div>
      {badge && (
        <span className="text-[13px] font-medium text-[#5e5e64]">{badge}</span>
      )}
    </Link>
  );
}

export default function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingDrafts, setPendingDrafts] = useState<number>(0);

  // Fetch pending draft count on mount
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("outbox_drafts")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .then(({ count }) => {
        if (count !== null) setPendingDrafts(count);
      });
  }, []);

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <>
      <aside
        style={{ width: 260 }}
        className="flex flex-col shrink-0 bg-[#0d0d12] border-r border-[#1e1e2a]"
      >
        {/* Logo / workspace switcher */}
        <div className="p-4 mb-1">
          <button className="flex items-center justify-between w-full px-2.5 py-2 rounded-md hover:bg-white/[0.05] transition-colors group">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded bg-[#00d4aa] flex items-center justify-center shadow-[0_0_12px_rgba(0,212,170,0.35)]">
                <Zap size={13} className="text-black fill-current" />
              </div>
              <span className="text-[15px] font-semibold tracking-tight text-[#f5f5f7]">
                Hollis
              </span>
            </div>
            <ChevronDown size={15} className="text-[#3a3a42]" />
          </button>
        </div>

        {/* Nav */}
        <div className="px-4 flex-1 overflow-y-auto space-y-0.5">
          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center justify-between px-2.5 py-[9px] rounded-[4px] text-[#8a8b91] hover:bg-white/[0.04] hover:text-[#f5f5f7] transition-colors group"
          >
            <div className="flex items-center gap-3">
              <Search
                size={18}
                strokeWidth={1.5}
                className="text-[#8a8b91] group-hover:text-[#f5f5f7] transition-colors"
              />
              <span className="text-[15px] font-medium leading-none tracking-tight">
                Search
              </span>
            </div>
            <span className="text-[12px] font-medium text-[#3a3a42] opacity-0 group-hover:opacity-100 transition-opacity">
              ⌘K
            </span>
          </button>

          {/* Outbox */}
          <Link
            href="/outbox"
            className={`w-full flex items-center justify-between px-2.5 py-[9px] rounded-[4px] transition-colors group ${
              pathname.startsWith("/outbox")
                ? "bg-[rgba(255,255,255,0.06)] text-[#f5f5f7]"
                : "text-[#8a8b91] hover:bg-white/[0.04] hover:text-[#f5f5f7]"
            }`}
          >
            <div className="flex items-center gap-3">
              <Send
                size={18}
                strokeWidth={pathname.startsWith("/outbox") ? 2 : 1.5}
                className={
                  pathname.startsWith("/outbox")
                    ? "text-[#00d4aa]"
                    : "text-[#8a8b91] group-hover:text-[#f5f5f7] transition-colors"
                }
              />
              <span className="text-[15px] font-medium leading-none tracking-tight">
                Outbox
              </span>
            </div>
            {pendingDrafts > 0 && (
              <span className="text-[11px] font-semibold text-[#00d4aa] bg-[#00d4aa]/10 border border-[#00d4aa]/20 rounded-full px-1.5 py-0.5 leading-none">
                {pendingDrafts}
              </span>
            )}
          </Link>

          {/* Inbox */}
          <Link
            href="/inbox"
            className="w-full flex items-center justify-between px-2.5 py-[9px] rounded-[4px] text-[#8a8b91] hover:bg-white/[0.04] hover:text-[#f5f5f7] transition-colors group"
          >
            <div className="flex items-center gap-3">
              <Inbox
                size={18}
                strokeWidth={1.5}
                className="text-[#8a8b91] group-hover:text-[#f5f5f7] transition-colors"
              />
              <span className="text-[15px] font-medium leading-none tracking-tight">
                Inbox
              </span>
            </div>
            <span className="text-[13px] font-medium text-[#5e5e64]">2</span>
          </Link>

          <SectionHeading>Workspace</SectionHeading>
          <NavItem href="/overview"               icon={LayoutGrid}  label="Overview"         pathname={pathname} />
          <NavItem href="/renewals"               icon={RefreshCw}   label="Renewals" badge="14" pathname={pathname} />
          <NavItem href="/certificates"           icon={ShieldCheck} label="Certificates"     pathname={pathname} />
          <NavItem href="/certificates/sequences" icon={Mail}        label="Follow-Ups"       pathname={pathname} />
          <NavItem href="/policies"               icon={Layers}      label="Policy Audit"     pathname={pathname} />
          <NavItem href="/import"                icon={Upload}      label="Import"           pathname={pathname} />

          <SectionHeading>CRM</SectionHeading>
          <NavItem href="/clients"   icon={Users}          label="Clients"          pathname={pathname} />
          <NavItem href="/documents" icon={ClipboardCheck} label="Document Chasing" badge="5" pathname={pathname} />
        </div>

        {/* User footer */}
        <div className="mt-auto border-t border-[#1e1e2a] p-4">
          <div
            className="flex items-center gap-3 px-2.5 py-2.5 rounded-md hover:bg-white/[0.05] cursor-pointer transition-colors group"
            onClick={handleSignOut}
          >
            <div className="w-8 h-8 rounded-full bg-[#00d4aa]/20 border border-[#00d4aa]/30 flex items-center justify-center shrink-0">
              <div className="w-4 h-4 rounded-full bg-[#00d4aa]/60" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium text-[#f5f5f7] truncate">
                Sully&apos;s Insurance
              </div>
              <span className="inline-block mt-0.5 px-1.5 py-px text-[10px] font-bold text-[#00d4aa] uppercase tracking-[0.06em] bg-[#00d4aa]/[0.1] border border-[#00d4aa]/20 rounded-full">
                Free Plan
              </span>
            </div>
            <LogOut
              size={16}
              className="text-[#5e5e64] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            />
          </div>
        </div>
      </aside>

      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
