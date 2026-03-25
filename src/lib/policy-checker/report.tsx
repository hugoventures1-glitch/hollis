/**
 * Policy Check PDF Report — Intelligent Policy Checker
 *
 * Generates a printable E&O documentation PDF using @react-pdf/renderer.
 *
 * IMPORTANT: Import only from API routes with:
 *   export const runtime = "nodejs"
 * Never import from page components or Edge runtime routes.
 */
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { PolicyCheckWithDetails, PolicyCheckFlag } from "@/types/policies";

// ── Styles ────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8,
    color: "#1a1a1a",
    backgroundColor: "#ffffff",
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
  },

  // Header
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: "#1a1a1a",
  },
  headerLeft: { flexDirection: "column" },
  reportTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#1a1a1a", marginBottom: 2 },
  reportSubtitle: { fontSize: 9, color: "#555555" },
  headerRight: { flexDirection: "column", alignItems: "flex-end" },
  metaLabel: { fontSize: 7, color: "#888888", textTransform: "uppercase", letterSpacing: 0.5 },
  metaValue: { fontSize: 8, color: "#1a1a1a", marginTop: 1 },

  // Verdict banner
  verdictBox: {
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  verdictLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  verdictMeta: { fontSize: 8 },

  // Section heading
  sectionHeading: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#dddddd",
  },

  // Summary note
  summaryNote: {
    fontSize: 9,
    color: "#333333",
    lineHeight: 1.5,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#f8f8f8",
    borderRadius: 3,
  },

  // Flag cards
  flagCard: {
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 3,
    borderLeftWidth: 3,
  },
  flagCardCritical: { backgroundColor: "#fff8f8", borderLeftColor: "#e53e3e" },
  flagCardWarning:  { backgroundColor: "#fffbf0", borderLeftColor: "#d97706" },
  flagCardAdvisory: { backgroundColor: "#f0f4ff", borderLeftColor: "#3b82f6" },

  flagTopRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  flagSeverityBadge: {
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderRadius: 2,
    marginRight: 6,
  },
  flagSeverityCritical: { backgroundColor: "#fee2e2", color: "#991b1b" },
  flagSeverityWarning:  { backgroundColor: "#fef3c7", color: "#92400e" },
  flagSeverityAdvisory: { backgroundColor: "#dbeafe", color: "#1e40af" },

  flagTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1a1a1a", flex: 1 },
  flagConfidence: { fontSize: 7, color: "#888888" },

  flagFieldLabel: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#888888", textTransform: "uppercase", letterSpacing: 0.3, marginTop: 4, marginBottom: 1 },
  flagFieldValue: { fontSize: 8, color: "#333333", lineHeight: 1.4 },

  flagAnnotation: {
    marginTop: 5,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: "#eeeeee",
    flexDirection: "row",
    alignItems: "center",
  },
  flagAnnotationText: { fontSize: 7, color: "#666666" },
  flagAnnotationBold: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#333333" },

  // Documents section
  docRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eeeeee",
  },
  docName: { fontSize: 8, color: "#1a1a1a", flex: 3 },
  docField: { fontSize: 7.5, color: "#555555", flex: 2 },
  docStatus: { fontSize: 7, color: "#888888", flex: 1, textAlign: "right" },

  // Stats row
  statsRow: { flexDirection: "row", marginBottom: 14, gap: 8 },
  statBox: { flex: 1, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: "#f8f8f8", borderRadius: 3 },
  statNum: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#1a1a1a" },
  statLabel: { fontSize: 6.5, color: "#888888", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 },

  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#dddddd",
    paddingTop: 6,
  },
  footerText: { fontSize: 6.5, color: "#aaaaaa" },
});

// ── Helper components ─────────────────────────────────────────

function severityCardStyle(severity: string) {
  if (severity === "critical") return [S.flagCard, S.flagCardCritical];
  if (severity === "warning")  return [S.flagCard, S.flagCardWarning];
  return [S.flagCard, S.flagCardAdvisory];
}

function severityBadgeStyle(severity: string) {
  if (severity === "critical") return [S.flagSeverityBadge, S.flagSeverityCritical];
  if (severity === "warning")  return [S.flagSeverityBadge, S.flagSeverityWarning];
  return [S.flagSeverityBadge, S.flagSeverityAdvisory];
}

function FlagCard({ flag }: { flag: PolicyCheckFlag }) {
  return (
    <View style={severityCardStyle(flag.severity)}>
      <View style={S.flagTopRow}>
        <Text style={severityBadgeStyle(flag.severity)}>
          {flag.severity.toUpperCase()}
        </Text>
        <Text style={S.flagTitle}>{flag.title}</Text>
        <Text style={S.flagConfidence}>
          {flag.confidence.charAt(0).toUpperCase() + flag.confidence.slice(1)} confidence
        </Text>
      </View>

      <Text style={S.flagFieldLabel}>What Was Found</Text>
      <Text style={S.flagFieldValue}>{flag.what_found}</Text>

      <Text style={S.flagFieldLabel}>What Was Expected</Text>
      <Text style={S.flagFieldValue}>{flag.what_expected}</Text>

      <Text style={S.flagFieldLabel}>Why It Matters</Text>
      <Text style={S.flagFieldValue}>{flag.why_it_matters}</Text>

      {flag.annotation_status && (
        <View style={S.flagAnnotation}>
          <Text style={S.flagAnnotationBold}>
            {flag.annotation_status.charAt(0).toUpperCase() + flag.annotation_status.slice(1)}
          </Text>
          {flag.annotation_reason && (
            <Text style={S.flagAnnotationText}> — {flag.annotation_reason}</Text>
          )}
          {flag.annotated_at && (
            <Text style={[S.flagAnnotationText, { marginLeft: "auto" }]}>
              {new Date(flag.annotated_at).toLocaleDateString("en-AU", { month: "short", day: "numeric", year: "numeric" })}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ── Document component ────────────────────────────────────────

function PolicyCheckReport({ check }: { check: PolicyCheckWithDetails }) {
  const clientName = check.clients?.name ?? "Ad-hoc Check";
  const checkDate  = new Date(check.created_at).toLocaleDateString("en-AU", {
    month: "long", day: "numeric", year: "numeric",
  });

  const criticalFlags = check.policy_check_flags.filter(f => f.severity === "critical");
  const warningFlags  = check.policy_check_flags.filter(f => f.severity === "warning");
  const advisoryFlags = check.policy_check_flags.filter(f => f.severity === "advisory");
  const totalFlags    = check.policy_check_flags.length;

  const verdict      = check.summary_verdict ?? "issues_found";
  const verdictLabel = verdict === "all_clear" ? "All Clear" : verdict === "critical_issues" ? "Critical Issues" : "Issues Found";
  const verdictBg    = verdict === "all_clear" ? "#f0fdf4" : verdict === "critical_issues" ? "#fff8f8" : "#fffbf0";
  const verdictColor = verdict === "all_clear" ? "#166534" : verdict === "critical_issues" ? "#991b1b" : "#92400e";

  const unannotated = check.policy_check_flags.filter(f => !f.annotation_status).length;

  return (
    <Document
      title={`Coverage Gap Report — ${clientName}`}
      author="Hollis"
      subject="E&O Documentation"
    >
      <Page size="LETTER" style={S.page}>

        {/* Header */}
        <View style={S.headerRow}>
          <View style={S.headerLeft}>
            <Text style={S.reportTitle}>Hollis Coverage Gap Report</Text>
            <Text style={S.reportSubtitle}>
              {clientName}
              {check.clients?.industry ? ` · ${check.clients.industry}` : ""}
            </Text>
          </View>
          <View style={S.headerRight}>
            <Text style={S.metaLabel}>Check Date</Text>
            <Text style={S.metaValue}>{checkDate}</Text>
            <Text style={[S.metaLabel, { marginTop: 4 }]}>Documents</Text>
            <Text style={S.metaValue}>{check.document_count}</Text>
            <Text style={[S.metaLabel, { marginTop: 4 }]}>Generated by</Text>
            <Text style={S.metaValue}>Hollis AI Platform</Text>
          </View>
        </View>

        {/* Verdict banner */}
        <View style={[S.verdictBox, { backgroundColor: verdictBg }]}>
          <Text style={[S.verdictLabel, { color: verdictColor }]}>{verdictLabel}</Text>
          <Text style={[S.verdictMeta, { color: verdictColor }]}>
            Confidence: {(check.overall_confidence ?? "medium").charAt(0).toUpperCase() + (check.overall_confidence ?? "medium").slice(1)}
            {unannotated > 0 ? `  ·  ${unannotated} flag${unannotated !== 1 ? "s" : ""} pending review` : "  ·  All flags reviewed"}
          </Text>
        </View>

        {/* Stats */}
        <View style={S.statsRow}>
          <View style={S.statBox}>
            <Text style={[S.statNum, { color: totalFlags > 0 ? "#1a1a1a" : "#22c55e" }]}>{totalFlags}</Text>
            <Text style={S.statLabel}>Total Flags</Text>
          </View>
          <View style={S.statBox}>
            <Text style={[S.statNum, { color: criticalFlags.length > 0 ? "#dc2626" : "#1a1a1a" }]}>{criticalFlags.length}</Text>
            <Text style={S.statLabel}>Critical</Text>
          </View>
          <View style={S.statBox}>
            <Text style={[S.statNum, { color: warningFlags.length > 0 ? "#d97706" : "#1a1a1a" }]}>{warningFlags.length}</Text>
            <Text style={S.statLabel}>Warnings</Text>
          </View>
          <View style={S.statBox}>
            <Text style={[S.statNum, { color: "#3b82f6" }]}>{advisoryFlags.length}</Text>
            <Text style={S.statLabel}>Advisory</Text>
          </View>
        </View>

        {/* Summary note */}
        {check.summary_note && (
          <>
            <Text style={S.sectionHeading}>Summary</Text>
            <Text style={S.summaryNote}>{check.summary_note}</Text>
          </>
        )}

        {/* Critical flags */}
        {criticalFlags.length > 0 && (
          <>
            <Text style={[S.sectionHeading, { color: "#991b1b" }]}>
              Critical Issues ({criticalFlags.length})
            </Text>
            {criticalFlags.map(flag => <FlagCard key={flag.id} flag={flag} />)}
          </>
        )}

        {/* Warning flags */}
        {warningFlags.length > 0 && (
          <>
            <Text style={[S.sectionHeading, { color: "#92400e" }]}>
              Warnings ({warningFlags.length})
            </Text>
            {warningFlags.map(flag => <FlagCard key={flag.id} flag={flag} />)}
          </>
        )}

        {/* Advisory flags */}
        {advisoryFlags.length > 0 && (
          <>
            <Text style={[S.sectionHeading, { color: "#1e40af" }]}>
              Advisory ({advisoryFlags.length})
            </Text>
            {advisoryFlags.map(flag => <FlagCard key={flag.id} flag={flag} />)}
          </>
        )}

        {/* All clear */}
        {totalFlags === 0 && (
          <View style={{ paddingVertical: 20, alignItems: "center" }}>
            <Text style={{ fontSize: 10, color: "#166534" }}>No coverage issues identified.</Text>
          </View>
        )}

        {/* Documents reviewed */}
        <Text style={S.sectionHeading}>Documents Reviewed</Text>
        <View style={{ borderRadius: 3, borderWidth: 0.5, borderColor: "#dddddd", overflow: "hidden" }}>
          <View style={[S.docRow, { backgroundColor: "#f8f8f8" }]}>
            <Text style={[S.docName, { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#888888", textTransform: "uppercase" }]}>Document</Text>
            <Text style={[S.docField, { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#888888", textTransform: "uppercase" }]}>Named Insured</Text>
            <Text style={[S.docField, { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#888888", textTransform: "uppercase" }]}>Policy #</Text>
            <Text style={[S.docStatus, { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#888888", textTransform: "uppercase" }]}>Status</Text>
          </View>
          {check.policy_check_documents.map(doc => (
            <View key={doc.id} style={S.docRow}>
              <Text style={S.docName}>{doc.original_filename}</Text>
              <Text style={S.docField}>{doc.extracted_named_insured ?? "—"}</Text>
              <Text style={S.docField}>{doc.extracted_policy_number ?? "—"}</Text>
              <Text style={S.docStatus}>{doc.extraction_status}</Text>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>
            Hollis Coverage Gap Report · {clientName} · {checkDate}
          </Text>
          <Text
            style={S.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

// ── Exported render function ──────────────────────────────────

export async function renderPolicyCheckReportPDF(
  check: PolicyCheckWithDetails
): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(PolicyCheckReport, { check }) as any;
  return renderToBuffer(element);
}
