"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Building2, Mail, Bell, Settings, Upload, Bot } from "lucide-react";
import type { AgentProfile } from "@/types/settings";
import { ProfileSection } from "./ProfileSection";
import { AgencySection } from "./AgencySection";
import { EmailSection } from "./EmailSection";
import { NotificationsSection } from "./NotificationsSection";
import { AccountSection } from "./AccountSection";
import { ImportSection } from "./ImportSection";
import { HollisSection } from "./HollisSection";

type Tab = "hollis" | "profile" | "agency" | "email" | "notifications" | "account" | "import";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "hollis",        label: "Hollis",             icon: Bot       },
  { id: "profile",       label: "Profile",            icon: User      },
  { id: "agency",        label: "Agency",             icon: Building2 },
  { id: "email",         label: "Email & Signatures", icon: Mail      },
  { id: "notifications", label: "Notifications",      icon: Bell      },
  { id: "account",       label: "Account",            icon: Settings  },
  { id: "import",        label: "Import Data",        icon: Upload    },
];

const VALID_TABS: Tab[] = ["hollis", "profile", "agency", "email", "notifications", "account", "import"];

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

  function handleTab(id: Tab) {
    setActiveTab(id);
    router.replace(`/settings?tab=${id}`, { scroll: false });
  }

  const isImport = activeTab === "import";

  return (
    <div className="flex h-full overflow-hidden bg-[#0C0C0C]">
      {/* Left tab rail */}
      <nav className="w-[200px] shrink-0 border-r border-[#181818] pt-8 pb-4 flex flex-col gap-0.5 px-2">
        <p className="text-[11px] font-semibold text-[#6b6b6b] uppercase tracking-[0.1em] px-2 mb-3">Settings</p>
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => handleTab(id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-[9px] rounded-[4px] text-left transition-colors text-[14px] font-medium ${
                active
                  ? "bg-[#1C1C1C] border-l-2 border-[#FAFAFA] text-[#FAFAFA] pl-[9px]"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03] border-l-2 border-transparent"
              }`}
            >
              <Icon
                size={16}
                strokeWidth={active ? 2 : 1.5}
                className={active ? "text-[#FAFAFA]" : "text-[#6b6b6b]"}
              />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Right content — full-width for import, constrained for everything else */}
      {isImport ? (
        <div className="flex-1 overflow-hidden">
          <ImportSection />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[640px] px-10 py-10">
            {activeTab === "hollis" && (
              <HollisSection initialOrders={profile.standing_orders} />
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
            {activeTab === "account" && (
              <AccountSection planName={planName} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
