"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2 } from "lucide-react";
import { useToast } from "@/components/actions/MicroToast";

interface RecommendationButtonProps {
  policyId: string;
  hasTerms: boolean;
}

export function RecommendationButton({ policyId, hasTerms }: RecommendationButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const handleSend = () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/renewals/${policyId}/recommendation`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        toast("Recommendation pack sent to client", "success");
        router.refresh();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed", "error");
      }
    });
  };

  return (
    <button
      onClick={handleSend}
      disabled={isPending || !hasTerms}
      className="flex items-center gap-2 text-[13px] px-4 py-2 rounded-lg bg-[#0d9488]/10 text-[#2dd4bf] hover:bg-[#0d9488]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
    >
      {isPending ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          Generating with Claude Sonnet…
        </>
      ) : (
        <>
          <FileText size={14} />
          Generate & Send Recommendation Pack
        </>
      )}
    </button>
  );
}
