/**
 * Throttle guard for cron send jobs.
 *
 * Checks send_logs to see if a given recipient was already contacted within
 * the specified hours window for the same sequence/policy context.
 * Returns true if the send should be suppressed.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isSendThrottled(
  supabase: any,
  recipient: string,
  contextId: string,       // policy_id, sequence_id, etc.
  contextColumn: "policy_id" | "touchpoint_id",
  windowHours = 48
): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("send_logs")
    .select("id")
    .eq("recipient", recipient)
    .eq(contextColumn, contextId)
    .gte("sent_at", windowStart)
    .limit(1);

  if (error) {
    // Fail open: if we can't check, let the send proceed
    console.warn("[throttle] Could not check send_logs:", error.message);
    return false;
  }

  return (data?.length ?? 0) > 0;
}
