"use client";

import { usePathname } from "next/navigation";
import AssistantPanel from "./AssistantPanel";
import type { AssistantPage } from "@/types/assistant";

function pathnameToPage(pathname: string): AssistantPage {
  if (pathname === "/overview" || pathname.startsWith("/overview/")) return "overview";
  if (pathname === "/renewals" || pathname.startsWith("/renewals/")) return "renewals";
  if (
    pathname === "/certificates" ||
    (pathname.startsWith("/certificates/") && !pathname.startsWith("/certificates/sequences"))
  )
    return "certificates";
  if (pathname === "/clients" || pathname.startsWith("/clients/")) return "clients";
  if (pathname === "/documents" || pathname.startsWith("/documents/")) return "documents";
  if (pathname === "/policies" || pathname.startsWith("/policies/")) return "policies";
  if (pathname === "/outbox" || pathname.startsWith("/outbox/")) return "outbox";
  return "other";
}

export default function AssistantPanelWrapper() {
  const pathname = usePathname();
  const page = pathnameToPage(pathname);
  return <AssistantPanel page={page} />;
}
