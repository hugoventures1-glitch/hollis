"use client";

import { useState } from "react";
import { User, Building2, Mail, Bell, Settings } from "lucide-react";
import type { AgentProfile } from "@/types/settings";
import { ProfileSection } from "./ProfileSection";
import { AgencySection } from "./AgencySection";
import { EmailSection } from "./EmailSection";
import { NotificationsSection } from "./NotificationsSection";
import { AccountSection } from "./AccountSection";

type Tab = "profile" | "agency" | "email" | "notifications" | "account";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "agency", label: "Agency", icon: Building2 },
  { id: "email", label: "Email & Signatures", icon: Mail },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "account", label: "Account", icon: Settings },
];

interface Props {
  profile: Partial<AgentProfile>;
  userEmail: string;
  planName: string;
}

export function SettingsShell({ profile, userEmail, planName }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  return (
    <div className="flex h-full overflow-hidden bg-[#0f0f14]">
      {/* Left tab rail */}
      <nav className="w-[200px] shrink-0 border-r border-[#1e1e2a] pt-8 pb-4 flex flex-col gap-0.5 px-2">
        <p className="text-[11px] font-semibold text-[#333333] uppercase tracking-[0.1em] px-2 mb-3">Settings</p>
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-[9px] rounded-[4px] text-left transition-colors text-[14px] font-medium ${
                active
                  ? "bg-[#111111] border-l-2 border-[#FAFAFA] text-[#0C0C0C] pl-[9px]"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03] border-l-2 border-transparent"
              }`}
            >
              <Icon
                size={16}
                strokeWidth={active ? 2 : 1.5}
                className={active ? "text-[#FAFAFA]" : "text-[#333333]"}
              />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Right content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[640px] px-10 py-10">
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
    </div>
  );
}
