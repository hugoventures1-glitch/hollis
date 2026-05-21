"use client";

import { useState, useEffect, useRef } from "react";
import { useTour } from "@/components/tour/TourProvider";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { LEARNING_MODE_THRESHOLD } from "@/lib/agent/tier-constants";
import type { InboxItem, DocChaseReplyItem } from "./page";
import { deriveType, type DisplayRow } from "./_components/inbox-types";
import { FlashingDotStyle } from "./_components/InboxShared";
import { ListView } from "./_components/InboxListView";
import { DecisionDetail } from "./_components/DecisionDetail";
import { TodoDetailView } from "./_components/TodoDetail";
import { DocChaseDetail } from "./_components/DocChaseDetail";
import { EscalationDetail } from "./_components/EscalationDetail";

export default function InboxClient({
  initialItems,
  docChaseReplies: initialDocChaseReplies = [],
}: {
  initialItems: InboxItem[];
  docChaseReplies?: DocChaseReplyItem[];
}) {
  const [items,            setItems]           = useState<InboxItem[]>(initialItems);
  const [docChaseReplies,  setDocChaseReplies] = useState<DocChaseReplyItem[]>(initialDocChaseReplies);
  const [selectedRow,      setSelectedRow]     = useState<DisplayRow | null>(null);
  const [isEditing,        setIsEditing]       = useState(false);
  const [editedBody,       setEditedBody]      = useState("");
  const [busy,             setBusy]            = useState(false);
  const [errorMsg,         setErrorMsg]        = useState<string | null>(null);
  const [sentId,           setSentId]          = useState<string | null>(null);
  const [sentAction,       setSentAction]      = useState<"approved" | "rejected" | "edited" | null>(null);
  const [checkedMap,       setCheckedMap]      = useState<Record<string, Set<number>>>({});
  const [readIds,          setReadIds]         = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("hollis_inbox_read");
      return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const [learningApproved,  setLearningApproved]  = useState(0);
  const [learningThreshold, setLearningThreshold] = useState(LEARNING_MODE_THRESHOLD);
  const [toasts,           setToasts]          = useState<{ id: string; message: string; type: "success" | "error" }[]>([]);

  const { signalReady } = useTour();
  const signaledRef = useRef(false);

  useEffect(() => {
    if (!signaledRef.current) {
      signaledRef.current = true;
      signalReady();
    }
  }, [signalReady]);

  function addToast(message: string, type: "success" | "error") {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }

  async function fetchLearningCount() {
    try {
      const res = await fetch("/api/agent/learning-count");
      if (!res.ok) return;
      const data = await res.json();
      setLearningApproved(data.approvedCount ?? 0);
      setLearningThreshold(data.threshold ?? 20);
    } catch { /* non-critical */ }
  }

  useEffect(() => { fetchLearningCount(); }, []);

  useEffect(() => {
    try {
      localStorage.setItem("hollis_inbox_read", JSON.stringify([...readIds]));
    } catch { /* storage quota or SSR */ }
  }, [readIds]);

  function openRow(row: DisplayRow) {
    setSelectedRow(row);
    setIsEditing(false);
    setErrorMsg(null);
    setSentId(null);
    setSentAction(null);
    setReadIds((prev) => new Set([...prev, row.id]));
    fetchLearningCount();
  }

  function clearSelection() {
    setSelectedRow(null);
    fetchLearningCount();
  }

  async function resolve(
    id: string,
    action: "approved" | "rejected" | "edited",
    extra?: { edited_body?: string }
  ) {
    const snapshot = items.find((i) => i.id === id);
    const clientName = snapshot?.policies?.client_name ?? "client";
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSentId(null); setSentAction(null); setIsEditing(false);
    clearSelection();

    fetch(`/api/agent/review/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    }).then(async (res) => {
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Failed"); }
      if (action === "rejected") {
        addToast(`Rejected — no email sent to ${clientName}`, "success");
      } else {
        addToast(`Email sent to ${clientName}`, "success");
      }
    }).catch(() => {
      if (snapshot) setItems((prev) => [snapshot, ...prev]);
      addToast(`Failed — item restored to inbox`, "error");
    });
  }

  function toggleCheck(itemId: string, idx: number) {
    setCheckedMap((prev) => {
      const current = new Set(prev[itemId] ?? []);
      if (current.has(idx)) current.delete(idx); else current.add(idx);
      return { ...prev, [itemId]: current };
    });
  }

  function renderDetail() {
    if (!selectedRow) return null;

    if (selectedRow.kind === "docchase" && selectedRow.dcItem) {
      const live = docChaseReplies.find((r) => r.id === selectedRow.id) ?? selectedRow.dcItem;
      return (
        <DocChaseDetail
          row={selectedRow}
          item={live}
          onBack={clearSelection}
          learningApproved={learningApproved}
          learningThreshold={learningThreshold}
          onMarkReceived={(id) => { setDocChaseReplies((prev) => prev.filter((r) => r.id !== id)); clearSelection(); }}
          onReplySent={(id) => { setDocChaseReplies((prev) => prev.filter((r) => r.id !== id)); clearSelection(); }}
          onRejected={(id) => { setDocChaseReplies((prev) => prev.filter((r) => r.id !== id)); clearSelection(); }}
          onRestoreItem={(item) => setDocChaseReplies((prev) => [item, ...prev])}
          addToast={addToast}
        />
      );
    }

    const selectedItem = items.find((i) => i.id === selectedRow.id);
    if (!selectedItem) { setSelectedRow(null); return null; }

    const isSent = sentId === selectedItem.id;
    const itemType = deriveType(selectedItem);

    if (itemType === "todo") {
      return (
        <TodoDetailView
          row={selectedRow}
          item={selectedItem}
          onBack={clearSelection}
          busy={busy}
          done={isSent && sentAction === "approved"}
          checked={checkedMap[selectedItem.id] ?? new Set<number>()}
          onToggle={(idx) => toggleCheck(selectedItem.id, idx)}
          onComplete={() => resolve(selectedItem.id, "approved")}
          learningApproved={learningApproved}
          learningThreshold={learningThreshold}
        />
      );
    }

    if (itemType === "escalation") {
      return (
        <EscalationDetail
          row={selectedRow}
          item={selectedItem}
          onBack={clearSelection}
          busy={false}
          resolved={false}
          resolutionType={null}
          errorMsg={null}
          onResolve={(resolution) => {
            const snapshot = items.find((i) => i.id === selectedItem.id);
            setItems((prev) => prev.filter((i) => i.id !== selectedItem.id));
            clearSelection();

            const toastMessages: Record<string, string> = {
              handled:   "Marked as handled — no further action taken.",
              resume:    "Sequence resumed — Hollis will continue outreach.",
              terminate: "Sequence terminated — renewal stopped.",
            };

            fetch(`/api/agent/escalation/${selectedItem.id}/resolve`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ resolution }),
            }).then(async (res) => {
              if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Failed to resolve escalation"); }
              addToast(toastMessages[resolution] ?? "Resolved.", "success");
            }).catch(() => {
              if (snapshot) setItems((prev) => [snapshot, ...prev]);
              addToast("Failed to resolve — item restored to inbox", "error");
            });
          }}
        />
      );
    }

    return (
      <DecisionDetail
        row={selectedRow}
        item={selectedItem}
        onBack={clearSelection}
        busy={busy}
        sent={isSent}
        sentAction={sentAction}
        isEditing={isEditing}
        editedBody={editedBody}
        errorMsg={errorMsg}
        onApprove={() => resolve(selectedItem.id, "approved")}
        onReject={() => resolve(selectedItem.id, "rejected")}
        onEdit={() => {
          setIsEditing(true);
          setEditedBody(typeof selectedItem.proposed_action?.payload?.body === "string" ? selectedItem.proposed_action.payload.body : "");
        }}
        onEditedBodyChange={setEditedBody}
        onConfirmEdit={() => resolve(selectedItem.id, "edited", { edited_body: editedBody })}
        onCancelEdit={() => { setIsEditing(false); setEditedBody(""); }}
      />
    );
  }

  return (
    <>
      <FlashingDotStyle />
      <div style={{ height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {selectedRow ? renderDetail() : (
          <ListView
            allItems={items}
            docChaseReplies={docChaseReplies}
            onOpen={openRow}
            readIds={readIds}
            onRead={(id) => setReadIds((prev) => new Set([...prev, id]))}
            selectedId={null}
          />
        )}
      </div>

      {toasts.length > 0 && (
        <div style={{ position: "fixed", bottom: 24, right: 24, display: "flex", flexDirection: "column", gap: 8, zIndex: 9999 }}>
          {toasts.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 500, color: t.type === "error" ? "#f87171" : "var(--text-primary)", background: "var(--surface)", border: `1px solid ${t.type === "error" ? "rgba(248,113,113,0.35)" : "var(--border)"}`, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", animation: "escalation-slide-in 200ms ease-out forwards" }}>
              {t.type === "error" ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
              {t.message}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
