export interface TourStep {
  element: string;
  popover: {
    title: string;
    description: string;
    side?: "top" | "bottom" | "left" | "right";
  };
}

export interface TourPage {
  path: string;
  steps: TourStep[];
}

export const TOUR_PAGES: TourPage[] = [
  {
    path: "/overview",
    steps: [
      {
        element: "[data-tour='automation-status']",
        popover: {
          title: "Automation Status",
          description: "This shows whether Hollis is running autonomously. When active, Hollis contacts clients, sends renewal emails, and handles routine replies without you lifting a finger.",
          side: "left",
        },
      },
      {
        element: "[data-tour='metric-tiles']",
        popover: {
          title: "Your Week at a Glance",
          description: "Track emails sent, renewals confirmed, active policies being monitored, and how many actions Hollis took on your behalf — all in one place.",
          side: "bottom",
        },
      },
      {
        element: "[data-tour='expiring-soon']",
        popover: {
          title: "Expiring Soon",
          description: "Policies expiring within the next 14 days. Click any client to jump straight to their renewal and see what Hollis has already done.",
          side: "left",
        },
      },
    ],
  },
  {
    path: "/inbox",
    steps: [
      {
        element: "[data-tour='inbox-list']",
        popover: {
          title: "Your Inbox",
          description: "Every action Hollis isn't 100% confident about lands here for your approval. Review the AI-drafted email, edit if needed, then approve or reject — all in seconds.",
          side: "right",
        },
      },
      {
        element: "[data-tour='inbox-escalations']",
        popover: {
          title: "Escalations",
          description: "These need your direct attention — claims, disputes, or situations Hollis can't handle alone. They're flagged separately so nothing critical gets missed.",
          side: "right",
        },
      },
    ],
  },
  {
    path: "/renewals",
    steps: [
      {
        element: "[data-tour='renewals-stats']",
        popover: {
          title: "Renewal Pipeline",
          description: "A live count of all active policies, which ones are expiring within 30 days, how many need your action, and how many are already progressing through the campaign.",
          side: "bottom",
        },
      },
      {
        element: "[data-tour='renewals-table']",
        popover: {
          title: "Campaign Stages",
          description: "Each row shows exactly where a client is in the renewal lifecycle — from first email right through to confirmed. Health scores flag at-risk clients before they slip.",
          side: "top",
        },
      },
    ],
  },
  {
    path: "/documents",
    steps: [
      {
        element: "[data-tour='doc-chase-request-btn']",
        popover: {
          title: "Document Chasing",
          description: "Need a loss run, policy schedule, or declaration? Hit this to start an automated sequence — Hollis sends reminders via email, SMS, and even a call script until the doc arrives.",
          side: "left",
        },
      },
    ],
  },
  {
    path: "/settings",
    steps: [
      {
        element: "[data-tour='settings-hollis']",
        popover: {
          title: "Hollis Settings",
          description: "Configure how Hollis behaves on your behalf. Write standing orders — persistent instructions Hollis follows on every reply — and toggle autonomous mode on or off.",
          side: "right",
        },
      },
      {
        element: "[data-tour='settings-profile']",
        popover: {
          title: "Your Profile",
          description: "Your name, title, and phone number. Hollis uses these when introducing itself in emails and call scripts — clients should feel like they're hearing from you.",
          side: "right",
        },
      },
      {
        element: "[data-tour='settings-agency']",
        popover: {
          title: "Agency Details",
          description: "Your brokerage name, ABN, AFSL, logo, and website. These appear in client-facing communications and certificate requests.",
          side: "right",
        },
      },
      {
        element: "[data-tour='settings-email']",
        popover: {
          title: "Email & Signatures",
          description: "Set your display name, reply-to address, and email signature. Every email Hollis sends on your behalf uses these — get them right before your first campaign fires.",
          side: "right",
        },
      },
      {
        element: "[data-tour='settings-notifications']",
        popover: {
          title: "Notifications",
          description: "Choose which events trigger an alert: renewal fired, document chased, COI requested, coverage gap detected, or a daily summary. Turn off anything that's noise for you.",
          side: "right",
        },
      },
      {
        element: "[data-tour='settings-renewals']",
        popover: {
          title: "Renewal Timing",
          description: "Control exactly when each touchpoint fires — 90-day email, 60-day email, 30-day SMS, and so on. Adjust these to match your agency's usual outreach cadence.",
          side: "right",
        },
      },
      {
        element: "[data-tour='settings-account']",
        popover: {
          title: "Account & Billing",
          description: "Manage your subscription plan, reset your password, and review billing details here.",
          side: "right",
        },
      },
    ],
  },
];
