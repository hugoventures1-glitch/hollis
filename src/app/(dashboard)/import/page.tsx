"use client";

import Link from "next/link";
import {
  Users,
  ShieldCheck,
  RefreshCw,
  Layers,
  Download,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import { triggerCsvDownload, generateTemplateCsv } from "@/lib/import/csv-utils";

// ── Template definitions ───────────────────────────────────────

const TEMPLATES = {
  policies: {
    headers: ["Client Name", "Expiration Date", "Policy Name", "Client Email", "Carrier", "Client Phone", "Premium"],
    rows: [
      ["Acme Corp", "2025-12-31", "Commercial GL", "acme@example.com", "Travelers", "5551234567", "4500"],
      ["Beta LLC", "2026-03-15", "BOP", "beta@example.com", "Hartford", "5559876543", "2200"],
    ],
  },
  clients: {
    headers: ["Name", "Email", "Phone", "Address", "Industry", "Notes"],
    rows: [
      ["Acme Corp", "acme@example.com", "555-123-4567", "123 Main St, Austin TX", "Construction", "Key account"],
      ["Beta LLC", "beta@example.com", "555-987-6543", "456 Oak Ave, Dallas TX", "Retail", ""],
    ],
  },
  certificates: {
    headers: ["Insured Name", "Holder Name", "Holder Email", "Expiration Date", "Certificate Number", "Coverage Type"],
    rows: [
      ["Acme Corp", "City of Austin", "certs@austin.gov", "2025-12-31", "HOL-2025-00001", "General Liability"],
      ["Beta LLC", "Westfield Mall", "insurance@westfield.com", "2026-03-15", "HOL-2025-00002", "GL, Auto"],
    ],
  },
  full: {
    headers: ["Client Name", "Client Email", "Client Phone", "Client Industry", "Policy Name", "Expiration Date", "Carrier", "Premium", "Holder Name", "Holder Email", "Cert Expiration"],
    rows: [
      ["Acme Corp", "acme@example.com", "555-123-4567", "Construction", "Commercial GL", "2025-12-31", "Travelers", "4500", "City of Austin", "certs@austin.gov", "2025-12-31"],
      ["Beta LLC", "beta@example.com", "555-987-6543", "Retail", "BOP", "2026-03-15", "Hartford", "2200", "", "", ""],
    ],
  },
};

interface ImportCard {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  cta: string;
  expectedColumns: string[];
  templateKey: keyof typeof TEMPLATES;
  featured?: boolean;
}

const CARDS: ImportCard[] = [
  {
    icon: RefreshCw,
    iconColor: "text-[#00d4aa]",
    iconBg: "bg-[#00d4aa]/10 border border-[#00d4aa]/20",
    title: "Policies & Renewals",
    subtitle: "Existing flow",
    description: "Import your active policies to generate renewal campaigns automatically at 90, 60, 30, and 14 days before expiry.",
    href: "/renewals/upload",
    cta: "Go to Upload",
    expectedColumns: ["Client Name", "Expiration Date", "Policy Name", "Client Email", "Carrier", "Premium"],
    templateKey: "policies",
  },
  {
    icon: Users,
    iconColor: "text-blue-400",
    iconBg: "bg-blue-900/20 border border-blue-800/30",
    title: "Clients",
    subtitle: "New",
    description: "Import your client list — names, emails, phone numbers, industry, and notes. Deduplicates by name + email.",
    href: "/import/clients",
    cta: "Import Clients",
    expectedColumns: ["Name (required)", "Email", "Phone", "Address", "Industry", "Notes"],
    templateKey: "clients",
  },
  {
    icon: ShieldCheck,
    iconColor: "text-amber-400",
    iconBg: "bg-amber-900/20 border border-amber-800/30",
    title: "Certificates",
    subtitle: "New",
    description: "Import issued COIs with insured, certificate holder, and expiry data. Deduplicates on certificate number.",
    href: "/import/certificates",
    cta: "Import Certificates",
    expectedColumns: ["Insured Name (required)", "Holder Name (required)", "Expiration Date (required)", "Holder Email", "Cert Number", "Coverage Type"],
    templateKey: "certificates",
  },
];

// ── Component ──────────────────────────────────────────────────

function TemplateButton({ templateKey }: { templateKey: keyof typeof TEMPLATES }) {
  const t = TEMPLATES[templateKey];
  return (
    <button
      onClick={() => {
        const csv = generateTemplateCsv(t.headers, t.rows);
        triggerCsvDownload(`hollis-${templateKey}-template.csv`, csv);
      }}
      className="flex items-center gap-1.5 text-[11px] text-[#505057] hover:text-[#8a8b91] transition-colors"
    >
      <Download size={11} />
      Template
    </button>
  );
}

export default function ImportHubPage() {
  return (
    <div className="flex flex-col h-full bg-[#0d0d12]">
      {/* Header */}
      <div className="flex items-center gap-2 px-10 h-[56px] border-b border-[#1e1e2a] shrink-0">
        <span className="text-[13px] text-[#f5f5f7] font-medium">Import</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-10 py-10">

          <div className="mb-8">
            <h1 className="text-[24px] font-bold text-[#f5f5f7] mb-2">
              Import your book of business
            </h1>
            <p className="text-[14px] text-[#8a8b91]">
              Import your existing data from any AMS, spreadsheet, or export file. All imports are non-destructive — duplicates are detected and skipped.
            </p>
          </div>

          {/* Standard import cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.href}
                  className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-5 flex flex-col"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${card.iconBg}`}>
                      <Icon size={18} className={card.iconColor} />
                    </div>
                    <TemplateButton templateKey={card.templateKey} />
                  </div>

                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-[#f5f5f7]">{card.title}</span>
                    {card.subtitle === "New" && (
                      <span className="text-[10px] font-semibold text-[#00d4aa] bg-[#00d4aa]/10 border border-[#00d4aa]/20 rounded-full px-1.5 py-0.5 uppercase tracking-wide">
                        New
                      </span>
                    )}
                  </div>

                  <p className="text-[12px] text-[#8a8b91] leading-relaxed mb-4 flex-1">
                    {card.description}
                  </p>

                  <div className="mb-4">
                    <div className="text-[10px] font-semibold text-[#505057] uppercase tracking-wider mb-2">
                      Expected columns
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {card.expectedColumns.map((col) => (
                        <span
                          key={col}
                          className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
                            col.includes("required")
                              ? "text-[#f5f5f7] bg-[#ffffff08] border-[#ffffff15]"
                              : "text-[#505057] bg-transparent border-[#1e1e2a]"
                          }`}
                        >
                          {col.replace(" (required)", "")}
                        </span>
                      ))}
                    </div>
                  </div>

                  <Link
                    href={card.href}
                    className="w-full h-8 flex items-center justify-center gap-1.5 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[12px] font-semibold hover:bg-[#00c49b] transition-colors"
                  >
                    {card.cta}
                    <ChevronRight size={13} />
                  </Link>
                </div>
              );
            })}
          </div>

          {/* Full book import — featured card */}
          <div className="rounded-xl bg-[#111118] border border-[#00d4aa]/20 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-9 h-9 rounded-lg bg-[#00d4aa]/10 border border-[#00d4aa]/20 flex items-center justify-center">
                    <Layers size={18} className="text-[#00d4aa]" />
                  </div>
                  <span className="text-[17px] font-bold text-[#f5f5f7]">Full Book Import</span>
                  <span className="text-[10px] font-semibold text-[#00d4aa] bg-[#00d4aa]/10 border border-[#00d4aa]/20 rounded-full px-2 py-0.5 uppercase tracking-wide">
                    Power Feature
                  </span>
                </div>
                <p className="text-[13px] text-[#8a8b91] leading-relaxed max-w-2xl">
                  Import everything from a single AMS export (Applied Epic, AMS360, HawkSoft, EZLynx). Hollis detects
                  which columns are clients, policies, and certificates — you confirm, then it imports all three entity
                  types at once. Supports files up to 10 MB. Large imports ({">"}500 rows) run asynchronously.
                </p>
              </div>
              <TemplateButton templateKey="full" />
            </div>

            <div className="flex items-center gap-4 mb-5">
              {[
                "Upload one CSV",
                "Hollis detects entity types",
                "Confirm column mapping",
                "Preview & import all at once",
              ].map((step, i) => (
                <div key={step} className="flex items-center gap-2">
                  {i > 0 && <ArrowRight size={12} className="text-[#505057]" />}
                  <div className="flex items-center gap-1.5 text-[12px] text-[#8a8b91]">
                    <div className="w-4 h-4 rounded-full bg-[#00d4aa]/10 border border-[#00d4aa]/20 flex items-center justify-center text-[9px] font-bold text-[#00d4aa]">
                      {i + 1}
                    </div>
                    {step}
                  </div>
                </div>
              ))}
            </div>

            <Link
              href="/import/full"
              className="inline-flex items-center gap-1.5 h-9 px-5 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] transition-colors"
            >
              Start Full Book Import
              <ChevronRight size={14} />
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
