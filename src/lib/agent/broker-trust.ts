import { LEARNING_MODE_THRESHOLD } from "@/lib/agent/tier-constants";

export interface BrokerTrustResult {
  isLearning: boolean;
  approvedCount: number;
  threshold: number;
}

/**
 * Checks whether a broker is still in learning mode by counting all approved
 * parser_outcomes (inbound and outbound). Both types of approvals build trust.
 */
export async function getBrokerTrustLevel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<BrokerTrustResult> {
  const { count } = await supabase
    .from("parser_outcomes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("broker_action", ["approved", "edited"]);

  const approvedCount = count ?? 0;
  return {
    isLearning: approvedCount < LEARNING_MODE_THRESHOLD,
    approvedCount,
    threshold: LEARNING_MODE_THRESHOLD,
  };
}
