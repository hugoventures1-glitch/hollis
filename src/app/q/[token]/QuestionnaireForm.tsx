"use client";

import { useState, useTransition } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";

interface Question {
  id: string;
  question: string;
  type: "text" | "textarea" | "select";
  options?: string[];
  placeholder?: string;
}

const QUESTIONS: Question[] = [
  {
    id: "business_activities",
    question: "Have there been any changes to your business activities or services in the past 12 months?",
    type: "textarea",
    placeholder: "Describe any changes to what your business does, new services, discontinued activities…",
  },
  {
    id: "revenue",
    question: "What is your estimated annual revenue for the current financial year?",
    type: "text",
    placeholder: "e.g. $850,000",
  },
  {
    id: "staff_count",
    question: "How many full-time equivalent staff do you currently employ?",
    type: "text",
    placeholder: "e.g. 12",
  },
  {
    id: "locations",
    question: "Have you added, closed, or changed any business locations?",
    type: "textarea",
    placeholder: "List any new or closed premises, or indicate no changes…",
  },
  {
    id: "major_contracts",
    question: "Do you have any new major contracts, projects, or clients that may affect your coverage needs?",
    type: "textarea",
    placeholder: "Describe any significant new contracts or projects…",
  },
  {
    id: "claims_history",
    question: "Have you had any incidents, claims, or near-misses in the past 12 months that have not yet been reported?",
    type: "textarea",
    placeholder: "Describe any incidents, or indicate none…",
  },
  {
    id: "other_changes",
    question: "Is there anything else that has changed or that you would like your broker to know before renewing?",
    type: "textarea",
    placeholder: "Any other relevant information…",
  },
];

interface QuestionnaireFormProps {
  token: string;
}

export function QuestionnaireForm({ token }: QuestionnaireFormProps) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});

  const updateResponse = (id: string, value: string) => {
    setResponses((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const filled = QUESTIONS.filter((q) => responses[q.id]?.trim());
    if (filled.length < 3) {
      setError("Please answer at least 3 questions before submitting.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/questionnaire/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ responses }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Submission failed");
        setSubmitted(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Submission failed. Please try again.");
      }
    });
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-[#00d4aa]/10 flex items-center justify-center">
          <CheckCircle2 size={32} className="text-[#00d4aa]" />
        </div>
        <h2 className="text-[22px] font-bold text-[#f5f5f7]">Thank you!</h2>
        <p className="text-[15px] text-[#8a8b91] max-w-sm leading-relaxed">
          Your responses have been received. Your broker will review them and be in touch soon regarding your renewal.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {QUESTIONS.map((q, i) => (
        <div key={q.id} className="space-y-2">
          <label className="block">
            <span className="text-[11px] font-semibold text-[#8a8b91] uppercase tracking-widest">
              {i + 1} of {QUESTIONS.length}
            </span>
            <span className="block text-[15px] text-[#f5f5f7] mt-1 leading-snug">{q.question}</span>
          </label>
          {q.type === "textarea" ? (
            <textarea
              value={responses[q.id] ?? ""}
              onChange={(e) => updateResponse(q.id, e.target.value)}
              placeholder={q.placeholder}
              rows={3}
              className="block w-full text-[14px] bg-[#0d0d12] border border-[#2a2a35] rounded-xl px-4 py-3 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-[#00d4aa]/50 resize-none transition-colors"
            />
          ) : (
            <input
              type="text"
              value={responses[q.id] ?? ""}
              onChange={(e) => updateResponse(q.id, e.target.value)}
              placeholder={q.placeholder}
              className="block w-full text-[14px] bg-[#0d0d12] border border-[#2a2a35] rounded-xl px-4 py-3 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-[#00d4aa]/50 transition-colors"
            />
          )}
        </div>
      ))}

      {error && (
        <div className="rounded-xl bg-red-950/30 border border-red-800/40 px-4 py-3 text-[13px] text-red-400">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-[#00d4aa] text-[#0d0d12] text-[15px] font-semibold hover:bg-[#00c49b] transition-colors disabled:opacity-60 shadow-[0_0_24px_rgba(0,212,170,0.3)]"
      >
        {isPending ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Submitting…
          </>
        ) : (
          "Submit Responses"
        )}
      </button>

      <p className="text-[11px] text-[#505057] text-center leading-relaxed">
        Your responses will be reviewed by your insurance broker and used to ensure your policy renewal accurately reflects your current needs.
      </p>
    </form>
  );
}
