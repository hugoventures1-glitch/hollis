import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LEARNING_MODE_THRESHOLD } from "@/lib/agent/tier-constants";

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { count } = await admin
      .from("parser_outcomes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("broker_action", ["approved", "edited"]);

    const approvedCount = count ?? 0;

    return NextResponse.json({
      approvedCount,
      threshold: LEARNING_MODE_THRESHOLD,
      isLearning: approvedCount < LEARNING_MODE_THRESHOLD,
    });
  } catch (err) {
    console.error("[agent/learning-count] Unexpected error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
