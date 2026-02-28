"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ExternalLink } from "lucide-react";
import { ActionButton } from "@/components/actions/ActionButton";
import { useToast } from "@/components/actions/MicroToast";
import type { Certificate } from "@/types/coi";

// ── Extended Certificate type with joined sequences ────────────────────────────

export interface CertWithSequences extends Certificate {
  holder_followup_sequences: Array<{
    id: string;
    sequence_status: string;
  }> | null;
}

// ── Coverage tag ──────────────────────────────────────────────────────────────

function CovTag({ label }: { label: string }) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#ffffff06] text-[#8a8b91] border border-[#ffffff0f]">
      {label}
    </span>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

const CERT_STATUS_STYLES: Record<string, string> = {
  draft:    "bg-[#ffffff08] text-[#8a8b91] border border-[#ffffff10]",
  sent:     "bg-[#00d4aa]/10 text-[#00d4aa] border border-[#00d4aa]/25",
  expired:  "bg-red-900/30 text-red-400 border border-red-700/30",
  outdated: "bg-orange-900/30 text-orange-400 border border-orange-700/30",
};

const CERT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  expired: "Expired",
  outdated: "Outdated",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
        CERT_STATUS_STYLES[status] ?? ""
      }`}
    >
      {CERT_STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── Certificate row ───────────────────────────────────────────────────────────

interface CertRowProps {
  cert: CertWithSequences;
  hasActiveSequence: boolean;
  onSequenceStarted: (certId: string) => void;
}

function CertRow({ cert, hasActiveSequence, onSequenceStarted }: CertRowProps) {
  const { toast } = useToast();
  const [followUpLoading, setFollowUpLoading] = useState(false);

  const handleFollowUp = useCallback(async () => {
    if (followUpLoading || hasActiveSequence) return;

    if (!cert.holder_email) {
      toast(`No holder email on file for ${cert.holder_name}`, "error");
      return;
    }

    setFollowUpLoading(true);
    try {
      const res = await fetch("/api/holder-followup/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          certificate_id: cert.id,
          holder_name: cert.holder_name,
          holder_email: cert.holder_email,
          expiry_date: cert.expiration_date ?? "",
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        toast(data.error ?? "Could not start follow-up sequence", "error");
        return;
      }

      onSequenceStarted(cert.id);
      toast(`3-touch sequence started for ${cert.holder_name}`, "success");
    } catch {
      toast("Connection error — please try again", "error");
    } finally {
      setFollowUpLoading(false);
    }
  }, [cert, followUpLoading, hasActiveSequence, toast, onSequenceStarted]);

  const handleViewPDF = useCallback(() => {
    window.open(`/api/coi/${cert.id}/pdf`, "_blank");
  }, [cert.id]);

  return (
    <tr
      className={`group border-b border-[#1e1e2a]/60 hover:bg-white/[0.02] transition-colors ${
        cert.has_gap ? "bg-red-950/[0.06]" : ""
      }`}
    >
      <td className="px-10 py-3">
        <Link href={`/certificates/${cert.id}`} className="block">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-[#505057]">
              {cert.certificate_number}
            </span>
            {cert.has_gap && (
              <span className="inline-flex items-center gap-1 text-[10px] text-red-400">
                <AlertTriangle size={10} /> Gap
              </span>
            )}
          </div>
          <div className="text-[14px] font-medium text-[#f5f5f7] group-hover:text-[#00d4aa] transition-colors mt-0.5">
            {cert.insured_name}
          </div>
        </Link>
      </td>
      <td className="px-4 py-3">
        <div className="text-[13px] text-[#c5c5cb]">{cert.holder_name}</div>
        {cert.holder_city && (
          <div className="text-[11px] text-[#505057]">
            {[cert.holder_city, cert.holder_state].filter(Boolean).join(", ")}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {cert.coverage_snapshot.gl?.enabled && <CovTag label="GL" />}
          {cert.coverage_snapshot.auto?.enabled && <CovTag label="Auto" />}
          {cert.coverage_snapshot.umbrella?.enabled && <CovTag label="Umb" />}
          {cert.coverage_snapshot.wc?.enabled && <CovTag label="WC" />}
        </div>
      </td>
      <td className="px-4 py-3 text-[12px] text-[#8a8b91] tabular-nums">
        {new Date(cert.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </td>
      <td className="px-4 py-3 text-[12px] text-[#8a8b91] tabular-nums">
        {cert.expiration_date
          ? new Date(cert.expiration_date + "T00:00:00").toLocaleDateString(
              "en-US",
              { month: "short", day: "numeric", year: "numeric" }
            )
          : "—"}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={cert.status} />
      </td>

      {/* Actions — fixed 120px, fade on hover */}
      <td className="px-4 py-3 w-[120px]">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {hasActiveSequence ? (
            <span className="text-[12px] text-zinc-500 whitespace-nowrap px-1">
              Sequence Active
            </span>
          ) : (
            <ActionButton
              label="Follow Up"
              onClick={handleFollowUp}
              loading={followUpLoading}
              variant="default"
            />
          )}
          <button
            onClick={handleViewPDF}
            className="inline-flex items-center h-7 px-2 text-zinc-600 hover:text-zinc-300 transition-colors"
            title="View PDF"
          >
            <ExternalLink size={12} />
          </button>
          <Link
            href={`/certificates/${cert.id}`}
            className="inline-flex items-center h-7 px-2 text-zinc-600 hover:text-zinc-300 transition-colors"
            title="View certificate"
          >
            <ArrowRight size={13} />
          </Link>
        </div>
      </td>
    </tr>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

interface CertsTableProps {
  certs: CertWithSequences[];
}

export function CertsTable({ certs }: CertsTableProps) {
  // Track which cert IDs have had a sequence started this session (optimistic)
  const [activatedSequences, setActivatedSequences] = useState<Set<string>>(
    new Set()
  );

  const handleSequenceStarted = useCallback((certId: string) => {
    setActivatedSequences((prev) => new Set([...prev, certId]));
  }, []);

  if (certs.length === 0) return null;

  return (
    <table className="w-full">
      <thead className="sticky top-0 bg-[#0d0d12] z-10">
        <tr className="border-b border-[#1e1e2a]">
          <th className="px-10 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
            Certificate
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
            Holder
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
            Coverage
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
            Issued
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
            Expires
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
            Status
          </th>
          {/* Fixed-width actions column */}
          <th className="px-4 py-3 w-[120px]">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {certs.map((cert) => {
          const hasActiveSequence =
            activatedSequences.has(cert.id) ||
            (cert.holder_followup_sequences ?? []).some(
              (s) => s.sequence_status === "active"
            );

          return (
            <CertRow
              key={cert.id}
              cert={cert}
              hasActiveSequence={hasActiveSequence}
              onSequenceStarted={handleSequenceStarted}
            />
          );
        })}
      </tbody>
    </table>
  );
}
