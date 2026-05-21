"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTour } from "@/components/tour/TourProvider";
import { User, Building2, Mail, Bell, Settings, Upload, Bot, Clock, CalendarRange } from "lucide-react";
import type { AgentProfile } from "@/types/settings";
import { ProfileSection } from "./ProfileSection";
import { AgencySection } from "./AgencySection";
import { EmailSection } from "./EmailSection";
import { NotificationsSection } from "./NotificationsSection";
import { AccountSection } from "./AccountSection";
import { ImportSection } from "./ImportSection";
import { HollisSection } from "./HollisSection";
import { LeadTimesSection } from "./LeadTimesSection";
import { TimelineSection } from "./TimelineSection";

type Tab = "hollis" | "profile" | "agency" | "email" | "notifications" | "renewals" | "timeline" | "account" | "import";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "hollis",        label: "Hollis",             icon: Bot       },
  { id: "profile",       label: "Profile",            icon: User      },
  { id: "agency",        label: "Agency",             icon: Building2 },
  { id: "email",         label: "Email & Signatures", icon: Mail      },
  { id: "notifications", label: "Notifications",      icon: Bell      },
  { id: "renewals",      label: "Renewal Timing",     icon: Clock         },
  { id: "timeline",      label: "Timeline",           icon: CalendarRange },
  { id: "account",       label: "Account",            icon: Settings      },
  { id: "import",        label: "Import Data",        icon: Upload    },
];

const VALID_TABS: Tab[] = ["hollis", "profile", "agency", "email", "notifications", "renewals", "timeline", "account", "import"];

interface Props {
  profile: Partial<AgentProfile>;
  userEmail: string;
  planName: string;
  initialTab?: string;
}

export function SettingsShell({ profile, userEmail, planName, initialTab }: Props) {
  const router = useRouter();

  const startTab: Tab =
    initialTab && VALID_TABS.includes(initialTab as Tab) ? (initialTab as Tab) : "hollis";

  const [activeTab, setActiveTab] = useState<Tab>(startTab);

  const { signalReady } = useTour();
  useEffect(() => { signalReady(); }, [signalReady]);

  function handleTab(id: Tab) {
    setActiveTab(id);
    router.replace(`/settings?tab=${id}`, { scroll: false });
  }

  const isFullWidth = activeTab === "import" || activeTab === "timeline";

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Left tab rail */}
      <nav className="w-[200px] shrink-0 border-r border-border-subtle pt-8 pb-4 flex flex-col gap-0.5 px-2">
        <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-[0.1em] px-2 mb-3">Settings</p>
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => handleTab(id)}
              {...(["hollis","profile","agency","email","notifications","renewals","account"].includes(id)
                ? { "data-tour": `settings-${id}` }
                : {})}
              className={`w-full flex items-center gap-2.5 px-2.5 py-[9px] rounded-[4px] text-left transition-colors text-[14px] font-medium ${
                active
                  ? "bg-border border-l-2 border-text-primary text-text-primary pl-[9px]"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03] border-l-2 border-transparent"
              }`}
            >
              <Icon
                size={16}
                strokeWidth={active ? 2 : 1.5}
                className={active ? "text-text-primary" : "text-text-tertiary"}
              />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Right content — full-width for import/timeline, constrained for everything else */}
      {isFullWidth ? (
        <div className="flex-1 overflow-hidden">
          {activeTab === "import" ? <ImportSection /> : <TimelineSection />}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[640px] px-8 pt-10 pb-4">
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em", lineHeight: 1 }}>Settings</h1>
            <p style={{ margin: "5px 0 0", fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.4 }}>Configure your profile, email templates, and Hollis behavior.</p>
          </div>
          <div className="max-w-[640px] px-10 pb-10">
            {activeTab === "hollis" && (
              <HollisSection
                initialOrders={profile.standing_orders}
                initialPaused={profile.automation_paused ?? false}
              />
            )}
            {activeTab === "profile" && (
              <ProfileSection profile={profile} userEmail={userEmail} />
            )}
            {activeTab === "agency" && (
              <AgencySection profile={profile} />
            )}
            {activeTab === "email" && (
              <EmailSection profile={profile} />
            )}
            {activeTab === "notifications" && (
              <NotificationsSection profile={profile} />
            )}
            {activeTab === "renewals" && (
              <LeadTimesSection />
            )}
            {activeTab === "account" && (
              <AccountSection planName={planName} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
