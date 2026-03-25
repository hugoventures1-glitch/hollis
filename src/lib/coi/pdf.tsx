// Server-side only — only import from Node.js API routes (runtime: 'nodejs')
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Certificate, GLCoverage, AutoCoverage, UmbrellaCoverage, WCCoverage } from "@/types/coi";

// ── Styles ───────────────────────────────────────────────────

const c = {
  black:   "#000000",
  gray:    "#444444",
  lgray:   "#888888",
  border:  "#999999",
  dborder: "#333333",
  bg:      "#f0f0f0",
  white:   "#ffffff",
};

const s = StyleSheet.create({
  page:     { fontFamily: "Helvetica", fontSize: 6.5, padding: 28, backgroundColor: c.white },
  bold:     { fontFamily: "Helvetica-Bold" },

  // Title bar
  titleBar: { backgroundColor: c.black, padding: "4 8", marginBottom: 2 },
  titleText:{ fontFamily: "Helvetica-Bold", fontSize: 10, color: c.white, textAlign: "center", letterSpacing: 1.5 },
  dateRow:  { flexDirection: "row", justifyContent: "flex-end", marginBottom: 4, fontSize: 6 },

  // Main grid
  row:      { flexDirection: "row" },
  col:      { flexDirection: "column" },
  flex1:    { flex: 1 },
  flex2:    { flex: 2 },

  // Boxes
  box:      { border: "0.5 solid #999999", padding: "3 4" },
  boxNoBt:  { borderTop: "0.5 solid #999999", borderLeft: "0.5 solid #999999", borderRight: "0.5 solid #999999", padding: "3 4" },
  boxNoTop: { borderBottom: "0.5 solid #999999", borderLeft: "0.5 solid #999999", borderRight: "0.5 solid #999999", padding: "3 4" },
  labelBg:  { backgroundColor: c.bg, padding: "1.5 3", marginBottom: 1 },
  label:    { fontFamily: "Helvetica-Bold", fontSize: 5.5, color: c.gray, textTransform: "uppercase" },
  value:    { fontSize: 6.5, color: c.black, marginTop: 1 },
  note:     { fontSize: 5.5, color: c.lgray },

  // Coverage table
  tHead:    { flexDirection: "row", backgroundColor: c.black, padding: "2 3" },
  tHeadTxt: { fontFamily: "Helvetica-Bold", fontSize: 5.5, color: c.white },
  tRow:     { flexDirection: "row", borderBottom: "0.5 solid #cccccc", minHeight: 14 },
  tCell:    { padding: "1.5 3", fontSize: 6 },
  tCellGray:{ padding: "1.5 3", fontSize: 6, color: c.lgray },
  check:    { width: 10 },
  typeCol:  { width: 110 },
  policyCol:{ width: 70 },
  dateCol:  { width: 48 },
  limitCol: { flex: 1 },

  // Checkbox
  cbRow:    { flexDirection: "row", alignItems: "center", marginBottom: 1 },
  cbBox:    { width: 7, height: 7, border: "0.5 solid #666666", marginRight: 3, alignItems: "center", justifyContent: "center" },
  cbBoxFill:{ width: 7, height: 7, border: "0.5 solid #000000", backgroundColor: c.black, marginRight: 3, alignItems: "center", justifyContent: "center" },
  cbCheck:  { fontSize: 5, color: c.white },
  cbLabel:  { fontSize: 5.5 },

  // Divider
  divider:  { borderBottom: "0.5 solid #cccccc", marginVertical: 1 },

  // Bottom section
  holderBox:{ border: "0.5 solid #999999", padding: "4 5", minHeight: 52 },
  cancelBox: { border: "0.5 solid #999999", padding: "4 5", flex: 1 },
  disclaimer:{ fontSize: 5, color: c.lgray, marginTop: 6, textAlign: "center" },
});

// ── Helper components ─────────────────────────────────────────

function Checkbox({ checked, label }: { checked: boolean; label: string }) {
  return (
    <View style={s.cbRow}>
      <View style={checked ? s.cbBoxFill : s.cbBox}>
        {checked && <Text style={s.cbCheck}>✓</Text>}
      </View>
      <Text style={s.cbLabel}>{label}</Text>
    </View>
  );
}

function LabelBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <View style={s.labelBg}>
        <Text style={s.label}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

function fmt(n: number | null | undefined, dash = "—"): string {
  if (!n) return dash;
  return `$${n.toLocaleString()}`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-AU", {
      month: "2-digit", day: "2-digit", year: "numeric",
    });
  } catch {
    return d;
  }
}

// ── Coverage rows ─────────────────────────────────────────────

function GLRow({ gl }: { gl: GLCoverage | undefined }) {
  const on = gl?.enabled ?? false;
  return (
    <View style={s.tRow}>
      <View style={[s.tCell, s.typeCol]}>
        <View style={s.cbRow}>
          <View style={on ? s.cbBoxFill : s.cbBox}>
            {on && <Text style={s.cbCheck}>✓</Text>}
          </View>
          <Text style={{ ...s.cbLabel, fontFamily: "Helvetica-Bold" }}>Commercial General Liability</Text>
        </View>
        <View style={{ marginLeft: 10, marginTop: 2 }}>
          <Checkbox checked={on && !(gl?.claims_made ?? false)} label="Occurrence" />
          <Checkbox checked={on && (gl?.claims_made ?? false)} label="Claims-Made" />
        </View>
      </View>
      <View style={[s.tCell, s.policyCol]}>
        <Text style={on ? {} : s.tCellGray}>{on ? (gl?.policy_number || "—") : ""}</Text>
      </View>
      <View style={[s.tCell, s.dateCol]}>
        <Text style={on ? {} : s.tCellGray}>{on ? fmtDate(gl?.effective) : ""}</Text>
      </View>
      <View style={[s.tCell, s.dateCol]}>
        <Text style={on ? {} : s.tCellGray}>{on ? fmtDate(gl?.expiration) : ""}</Text>
      </View>
      <View style={[s.tCell, s.limitCol]}>
        {on ? (
          <>
            <Text>Each Occurrence: {fmt(gl?.each_occurrence)}</Text>
            <Text>Damage to Rented: {fmt(gl?.damage_to_rented_premises)}</Text>
            <Text>Med Exp: {fmt(gl?.med_exp)}</Text>
            <Text>Personal & Adv Inj: {fmt(gl?.personal_adv_injury)}</Text>
            <Text>General Aggregate: {fmt(gl?.general_aggregate)}</Text>
            <Text>Products-Comp/Op: {fmt(gl?.products_comp_ops_agg)}</Text>
          </>
        ) : (
          <Text style={s.tCellGray}>—</Text>
        )}
      </View>
    </View>
  );
}

function AutoRow({ auto }: { auto: AutoCoverage | undefined }) {
  const on = auto?.enabled ?? false;
  return (
    <View style={s.tRow}>
      <View style={[s.tCell, s.typeCol]}>
        <View style={s.cbRow}>
          <View style={on ? s.cbBoxFill : s.cbBox}>
            {on && <Text style={s.cbCheck}>✓</Text>}
          </View>
          <Text style={{ ...s.cbLabel, fontFamily: "Helvetica-Bold" }}>Automobile Liability</Text>
        </View>
        <View style={{ marginLeft: 10, marginTop: 2 }}>
          <Checkbox checked={on && (auto?.any_auto ?? false)} label="Any Auto" />
          <Checkbox checked={on && (auto?.owned_autos_only ?? false)} label="Owned Autos Only" />
          <Checkbox checked={on && (auto?.hired_autos_only ?? false)} label="Hired Autos Only" />
          <Checkbox checked={on && (auto?.non_owned_autos_only ?? false)} label="Non-Owned Autos Only" />
        </View>
      </View>
      <View style={[s.tCell, s.policyCol]}>
        <Text>{on ? (auto?.policy_number || "—") : ""}</Text>
      </View>
      <View style={[s.tCell, s.dateCol]}>
        <Text>{on ? fmtDate(auto?.effective) : ""}</Text>
      </View>
      <View style={[s.tCell, s.dateCol]}>
        <Text>{on ? fmtDate(auto?.expiration) : ""}</Text>
      </View>
      <View style={[s.tCell, s.limitCol]}>
        {on ? (
          <>
            <Text>Combined Single Limit: {fmt(auto?.combined_single_limit)}</Text>
            {auto?.bodily_injury_per_person && <Text>BI Per Person: {fmt(auto.bodily_injury_per_person)}</Text>}
            {auto?.bodily_injury_per_accident && <Text>BI Per Accident: {fmt(auto.bodily_injury_per_accident)}</Text>}
            {auto?.property_damage_per_accident && <Text>PD Per Accident: {fmt(auto.property_damage_per_accident)}</Text>}
          </>
        ) : (
          <Text style={s.tCellGray}>—</Text>
        )}
      </View>
    </View>
  );
}

function UmbrellaRow({ umbrella }: { umbrella: UmbrellaCoverage | undefined }) {
  const on = umbrella?.enabled ?? false;
  return (
    <View style={s.tRow}>
      <View style={[s.tCell, s.typeCol]}>
        <View style={s.cbRow}>
          <View style={on ? s.cbBoxFill : s.cbBox}>
            {on && <Text style={s.cbCheck}>✓</Text>}
          </View>
          <Text style={{ ...s.cbLabel, fontFamily: "Helvetica-Bold" }}>Umbrella / Excess Liability</Text>
        </View>
        <View style={{ marginLeft: 10, marginTop: 2 }}>
          <Checkbox checked={on && (umbrella?.is_umbrella ?? true)} label="Umbrella" />
          <Checkbox checked={on && !(umbrella?.is_umbrella ?? true)} label="Excess" />
          <Checkbox checked={on && (umbrella?.claims_made ?? false)} label="Claims-Made" />
        </View>
      </View>
      <View style={[s.tCell, s.policyCol]}>
        <Text>{on ? (umbrella?.policy_number || "—") : ""}</Text>
      </View>
      <View style={[s.tCell, s.dateCol]}>
        <Text>{on ? fmtDate(umbrella?.effective) : ""}</Text>
      </View>
      <View style={[s.tCell, s.dateCol]}>
        <Text>{on ? fmtDate(umbrella?.expiration) : ""}</Text>
      </View>
      <View style={[s.tCell, s.limitCol]}>
        {on ? (
          <>
            <Text>Each Occurrence: {fmt(umbrella?.each_occurrence)}</Text>
            <Text>Aggregate: {fmt(umbrella?.aggregate)}</Text>
          </>
        ) : (
          <Text style={s.tCellGray}>—</Text>
        )}
      </View>
    </View>
  );
}

function WCRow({ wc }: { wc: WCCoverage | undefined }) {
  const on = wc?.enabled ?? false;
  return (
    <View style={s.tRow}>
      <View style={[s.tCell, s.typeCol]}>
        <View style={s.cbRow}>
          <View style={on ? s.cbBoxFill : s.cbBox}>
            {on && <Text style={s.cbCheck}>✓</Text>}
          </View>
          <Text style={{ ...s.cbLabel, fontFamily: "Helvetica-Bold" }}>Workers Compensation</Text>
        </View>
        <View style={{ marginLeft: 10, marginTop: 2 }}>
          <Text style={s.cbLabel}>and Employers&apos; Liability</Text>
        </View>
      </View>
      <View style={[s.tCell, s.policyCol]}>
        <Text>{on ? (wc?.policy_number || "—") : ""}</Text>
      </View>
      <View style={[s.tCell, s.dateCol]}>
        <Text>{on ? fmtDate(wc?.effective) : ""}</Text>
      </View>
      <View style={[s.tCell, s.dateCol]}>
        <Text>{on ? fmtDate(wc?.expiration) : ""}</Text>
      </View>
      <View style={[s.tCell, s.limitCol]}>
        {on ? (
          <>
            <Text>E.L. Each Accident: {fmt(wc?.el_each_accident)}</Text>
            <Text>E.L. Disease-Policy Limit: {fmt(wc?.el_disease_policy_limit)}</Text>
            <Text>E.L. Disease-Each Employee: {fmt(wc?.el_disease_each_employee)}</Text>
          </>
        ) : (
          <Text style={s.tCellGray}>—</Text>
        )}
      </View>
    </View>
  );
}

// ── Main document ─────────────────────────────────────────────

function ACORDDocument({ cert }: { cert: Certificate }) {
  const snap = cert.coverage_snapshot;
  const today = new Date().toLocaleDateString("en-AU", {
    month: "2-digit", day: "2-digit", year: "numeric",
  });

  // Derive insurer names from coverage
  const insurers = Array.from(
    new Set(
      [snap.gl?.insurer, snap.auto?.insurer, snap.umbrella?.insurer, snap.wc?.insurer]
        .filter((i): i is string => !!i && i.trim() !== "")
    )
  ).slice(0, 4);

  const holderLines = [
    cert.holder_name,
    cert.holder_address,
    [cert.holder_city, cert.holder_state, cert.holder_zip].filter(Boolean).join(" "),
  ].filter(Boolean);

  return (
    <Document title={`COI ${cert.certificate_number}`}>
      <Page size="LETTER" style={s.page}>

        {/* Title */}
        <View style={s.titleBar}>
          <Text style={s.titleText}>CERTIFICATE OF LIABILITY INSURANCE</Text>
        </View>
        <View style={s.dateRow}>
          <Text>DATE (MM/DD/YYYY): {today}</Text>
        </View>

        {/* THIS CERTIFICATE... notice */}
        <View style={{ ...s.box, marginBottom: 3, backgroundColor: "#fffbe6" }}>
          <Text style={{ fontSize: 5.5, color: "#555500" }}>
            THIS CERTIFICATE IS ISSUED AS A MATTER OF INFORMATION ONLY AND CONFERS NO RIGHTS UPON THE CERTIFICATE HOLDER. THIS
            CERTIFICATE DOES NOT AFFIRMATIVELY OR NEGATIVELY AMEND, EXTEND OR ALTER THE COVERAGE AFFORDED BY THE POLICIES BELOW.
            THIS CERTIFICATE OF INSURANCE DOES NOT CONSTITUTE A CONTRACT BETWEEN THE ISSUING INSURER(S), AUTHORIZED REPRESENTATIVE
            OR PRODUCER, AND THE CERTIFICATE HOLDER.
          </Text>
          {cert.additional_insured_language ? (
            <Text style={{ fontSize: 5.5, color: "#555500", marginTop: 2 }}>
              IMPORTANT: If the certificate holder is an ADDITIONAL INSURED, the policy(ies) must have ADDITIONAL INSURED provisions
              or be endorsed. If SUBROGATION IS WAIVED, subject to the terms and conditions of the policy.
            </Text>
          ) : null}
        </View>

        {/* Producer + Insured row */}
        <View style={[s.row, { marginBottom: 3 }]}>
          {/* Producer */}
          <View style={[s.box, s.flex1, { marginRight: 3 }]}>
            <LabelBox label="Producer">
              <Text style={s.value}>{cert.producer_name || "—"}</Text>
              {cert.producer_address && <Text style={s.note}>{cert.producer_address}</Text>}
              {cert.producer_phone && <Text style={s.note}>Tel: {cert.producer_phone}</Text>}
              {cert.producer_email && <Text style={s.note}>{cert.producer_email}</Text>}
            </LabelBox>
          </View>
          {/* Insured */}
          <View style={[s.box, s.flex2]}>
            <LabelBox label="Insured">
              <Text style={[s.value, s.bold]}>{cert.insured_name}</Text>
              {cert.insured_address && <Text style={s.note}>{cert.insured_address}</Text>}
            </LabelBox>
          </View>
        </View>

        {/* Insurers */}
        <View style={[s.box, { marginBottom: 3 }]}>
          <Text style={[s.bold, { fontSize: 6, marginBottom: 2 }]}>
            INSURER(S) AFFORDING COVERAGE
          </Text>
          <View style={s.row}>
            {["A","B","C","D"].map((letter, i) => (
              <View key={letter} style={[s.flex1, i < 3 ? { marginRight: 4 } : {}]}>
                <Text style={s.note}>Insurer {letter}: <Text style={{ color: c.black }}>{insurers[i] || ""}</Text></Text>
              </View>
            ))}
          </View>
          <View style={[s.row, { marginTop: 2 }]}>
            <Text style={s.note}>Certificate #: <Text style={[s.bold, { color: c.black }]}>{cert.certificate_number}</Text></Text>
          </View>
        </View>

        {/* Coverage table */}
        <View style={{ marginBottom: 3 }}>
          <View style={s.tHead}>
            <Text style={[s.tHeadTxt, s.typeCol]}>Type of Insurance / Policy Details</Text>
            <Text style={[s.tHeadTxt, s.policyCol]}>Policy Number</Text>
            <Text style={[s.tHeadTxt, s.dateCol]}>Eff. Date</Text>
            <Text style={[s.tHeadTxt, s.dateCol]}>Exp. Date</Text>
            <Text style={[s.tHeadTxt, s.limitCol]}>Limits</Text>
          </View>
          <GLRow gl={snap.gl} />
          <AutoRow auto={snap.auto} />
          <UmbrellaRow umbrella={snap.umbrella} />
          <WCRow wc={snap.wc} />
        </View>

        {/* Description of operations */}
        <View style={[s.box, { marginBottom: 3 }]}>
          <LabelBox label="Description of Operations / Locations / Vehicles / Additional Insured / Special Items">
            <Text style={[s.value, { minHeight: 28 }]}>
              {cert.description || ""}
              {cert.additional_insured_language ? `\n\nAdditional Insured: ${cert.additional_insured_language}` : ""}
            </Text>
          </LabelBox>
        </View>

        {/* Certificate holder + Cancellation */}
        <View style={[s.row, { marginBottom: 4 }]}>
          <View style={[s.holderBox, { flex: 1, marginRight: 3 }]}>
            <Text style={[s.bold, { fontSize: 6, marginBottom: 3 }]}>CERTIFICATE HOLDER</Text>
            {holderLines.map((line, i) => (
              <Text key={i} style={{ fontSize: 6.5, lineHeight: 1.4 }}>{line}</Text>
            ))}
          </View>
          <View style={s.cancelBox}>
            <Text style={[s.bold, { fontSize: 6, marginBottom: 3 }]}>CANCELLATION</Text>
            <Text style={{ fontSize: 5.5, lineHeight: 1.5 }}>
              SHOULD ANY OF THE ABOVE DESCRIBED POLICIES BE CANCELLED BEFORE THE EXPIRATION
              DATE THEREOF, NOTICE WILL BE DELIVERED IN ACCORDANCE WITH THE POLICY PROVISIONS.
            </Text>
            <Text style={[s.bold, { fontSize: 5.5, marginTop: 6 }]}>AUTHORIZED REPRESENTATIVE</Text>
            <Text style={{ fontSize: 5.5, marginTop: 12, borderTop: "0.5 solid #999", paddingTop: 2 }}>
              {cert.producer_name || ""}
            </Text>
          </View>
        </View>

        {/* Disclaimer */}
        <Text style={s.disclaimer}>
          ACORD 25 (2016/03) © 1988-2016 ACORD CORPORATION. All rights reserved. The ACORD name and logo are registered marks of ACORD.
          Generated by Hollis — {cert.certificate_number}
        </Text>

      </Page>
    </Document>
  );
}

// ── Exported render function ──────────────────────────────────

export async function renderCOIPDF(cert: Certificate): Promise<Buffer> {
  return renderToBuffer(<ACORDDocument cert={cert} />) as Promise<Buffer>;
}
