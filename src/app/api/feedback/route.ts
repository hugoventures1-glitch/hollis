import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("agent_profiles")
    .select("first_name, last_name, agency_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const formData    = await req.formData();
  const message     = (formData.get("message") as string | null)?.trim();
  const screenshot  = formData.get("screenshot") as File | null;

  if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });

  const brokerName  = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "A broker";
  const agency      = profile?.agency_name ?? "";
  const destination = process.env.FEEDBACK_EMAIL ?? process.env.REPLY_TO_EMAIL ?? "hugo@hollisai.com.au";

  const attachments: { filename: string; content: string }[] = [];
  if (screenshot && screenshot.size > 0) {
    const buffer = Buffer.from(await screenshot.arrayBuffer());
    attachments.push({
      filename: screenshot.name || "screenshot.png",
      content:  buffer.toString("base64"),
    });
  }

  const safeMessage = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const subjectLine = `Feedback from ${brokerName}${agency ? ` · ${agency}` : ""}`;

  await resend.emails.send({
    from:    `Hollis Feedback <${process.env.FROM_EMAIL}>`,
    to:      destination,
    replyTo: user.email,
    subject: subjectLine,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;padding:32px 24px;color:#111;">
        <p style="font-size:12px;color:#999;margin:0 0 20px;">
          From&nbsp;<strong style="color:#333;">${brokerName}</strong>${agency ? `&nbsp;·&nbsp;${agency}` : ""}
          &nbsp;&nbsp;|&nbsp;&nbsp;${user.email}
        </p>
        <p style="font-size:15px;line-height:1.7;white-space:pre-wrap;margin:0;">${safeMessage}</p>
        ${attachments.length > 0 ? `<p style="font-size:12px;color:#aaa;margin-top:20px;">📎 Screenshot attached</p>` : ""}
      </div>
    `,
    attachments: attachments.length > 0 ? attachments : undefined,
  });

  return NextResponse.json({ ok: true });
}
