"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { ActionButton } from "@/components/actions/ActionButton";
import { useToast } from "@/components/actions/MicroToast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#ffffff06] text-[#8a8a8a] border border-[#ffffff0f]">
      {label}
    </span>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

const CERT_STATUS_STYLES: Record<string, string> = {
  draft:    "bg-[#ffffff08] text-[#8a8a8a] border border-[#ffffff10]",
  sent:     "bg-[#FAFAFA]/[0.06] text-[#FAFAFA] border border-[#1C1C1C]",
  expired:  "bg-red-900/30 text-red-400 border border-red-700/30",
  outdated: "bg-[#FF4444]/[0.06] text-[#FF4444] border border-[#FF4444]/[0.2]",
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
  const router = useRouter();
  const { toast } = useToast();
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleRowClick = useCallback(() => {
    router.push(`/certificates/${cert.id}`);
  }, [router, cert.id]);

  const handleFollowUp = useCallback(() => {
    if (followUpLoading || hasActiveSequence) return;
    if (!cert.holder_email) {
      toast(`No holder email on file for ${cert.holder_name}`, "error");
      return;
    }
    setShowConfirm(true);
  }, [cert, followUpLoading, hasActiveSequence, toast]);

  const confirmFollowUp = useCallback(async () => {
    setShowConfirm(false);
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
  }, [cert, toast, onSequenceStarted]);

  const handleViewPDF = useCallback(() => {
    window.open(`/api/coi/${cert.id}/pdf`, "_blank");
  }, [cert.id]);

  return (
    <>
    {showConfirm && (
      <ConfirmDialog
        title="Start follow-up sequence?"
        body={`This will send a 3-touch email sequence to ${cert.holder_name}. This cannot be undone.`}
        confirmLabel="Start Sequence"
        onConfirm={confirmFollowUp}
        onCancel={() => setShowConfirm(false)}
      />
    )}
    <tr
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(e) => e.key === "Enter" && handleRowClick()}
      className={`group border-b border-[#1C1C1C]/60 hover:bg-white/[0.02] transition-colors cursor-pointer ${
        cert.has_gap ? "bg-red-950/[0.06]" : ""
      }`}
    >
      <td className="px-10 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-[#6b6b6b]">
            {cert.certificate_number}
          </span>
          {cert.has_gap && (
            <span className="inline-flex items-center gap-1 text-[10px] text-red-400">
              <AlertTriangle size={10} /> Gap
            </span>
          )}
        </div>
        <div className="text-[14px] font-medium text-[#FAFAFA] group-hover:text-[#FAFAFA] transition-colors mt-0.5">
          {cert.insured_name}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-[13px] text-[#FAFAFA]">{cert.holder_name}</div>
        {cert.holder_city && (
          <div className="text-[11px] text-[#6b6b6b]">
            {[cert.holder_city, cert.holder_state].filter(Boolean).join(", ")}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-[12px] text-[#8a8a8a] tabular-nums">
        {new Date(cert.created_at).toLocaleDateString("en-AU", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </td>
      <td className="px-4 py-3 text-[12px] text-[#8a8a8a] tabular-nums">
        {cert.expiration_date
          ? new Date(cert.expiration_date + "T00:00:00").toLocaleDateString(
              "en-AU",
              { month: "short", day: "numeric", year: "numeric" }
            )
          : "—"}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={cert.status} />
      </td>

      {/* Actions — fixed 120px, fade on hover; stop propagation so row click doesn't fire */}
      <td className="px-4 py-3 w-[120px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {hasActiveSequence ? (
            <span className="text-[12px] text-[#8a8a8a] whitespace-nowrap px-1">
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
            className="inline-flex items-center h-7 px-2 text-[#6b6b6b] hover:text-[#FAFAFA] transition-colors"
            title="View PDF"
          >
            <ExternalLink size={12} />
          </button>
        </div>
      </td>
    </tr>
    </>
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
      <thead className="sticky top-0 bg-[#0C0C0C] z-10">
        <tr className="border-b border-[#1C1C1C]">
          <th className="px-10 py-3 text-left text-[11px] font-medium text-[#8a8a8a] uppercase tracking-wider">
            Certificate
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8a8a] uppercase tracking-wider">
            Holder
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8a8a] uppercase tracking-wider">
            Issued
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8a8a] uppercase tracking-wider">
            Expires
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8a8a] uppercase tracking-wider">
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
