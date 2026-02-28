/**
 * Shared CSV import utilities for Hollis Book of Business imports.
 *
 * Handles: papaparse wrapping, date normalisation (multi-format),
 * phone normalisation, email normalisation, template generation.
 */
import Papa from "papaparse";
import {
  parse as dfParse,
  isValid as dfIsValid,
  format as dfFormat,
} from "date-fns";

// ── CSV Parsing ────────────────────────────────────────────────

export interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
  rawRows: string[][];
}

/** Parse a CSV file using papaparse. Skips empty rows. */
export function parseCSVText(text: string): ParsedCSV {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = result.meta.fields ?? [];
  const rows = result.data;

  // Also keep raw arrays (header order preserved)
  const rawRows = rows.map((row) => headers.map((h) => row[h] ?? ""));

  return { headers, rows, rawRows };
}

/** Normalise a CSV header for synonym matching. */
export function normaliseHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");
}

// ── Column auto-mapping ────────────────────────────────────────

type SynonymMap<T extends string> = Record<T, string[]>;

export function autoMap<T extends string>(
  headers: string[],
  synonyms: SynonymMap<T>
): Record<string, T | ""> {
  const mapping: Record<string, T | ""> = {};
  for (const h of headers) {
    const norm = normaliseHeader(h);
    let matched: T | "" = "";
    for (const [field, syns] of Object.entries(synonyms) as [T, string[]][]) {
      if (syns.includes(norm)) {
        matched = field;
        break;
      }
    }
    mapping[h] = matched;
  }
  return mapping;
}

// ── Date normalisation ─────────────────────────────────────────

const DATE_FORMATS = [
  "yyyy-MM-dd",
  "MM/dd/yyyy",
  "M/d/yyyy",
  "MM/dd/yy",
  "M/d/yy",
  "dd/MM/yyyy",
  "dd-MM-yyyy",
  "yyyy/MM/dd",
  "MMM d yyyy",
  "MMM d, yyyy",
  "MMMM d, yyyy",
  "MMMM d yyyy",
  "d-MMM-yy",
  "d-MMM-yyyy",
  "dd-MMM-yy",
  "dd-MMM-yyyy",
  "MMM dd yyyy",
  "MMM dd, yyyy",
];

/**
 * Normalise a date string to YYYY-MM-DD.
 * Returns null if parsing fails.
 */
export function normaliseDate(raw: string): string | null {
  if (!raw?.trim()) return null;

  const cleaned = raw.trim().replace(/\s+/g, " ");

  // Try ISO first
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;

  // Excel serial date (number of days since 1900-01-01)
  if (/^\d{4,5}$/.test(cleaned)) {
    const serial = parseInt(cleaned, 10);
    if (serial > 1 && serial < 73050) {
      // before year 2100
      const excelEpoch = new Date(1900, 0, 1);
      excelEpoch.setDate(excelEpoch.getDate() + serial - 2); // Excel bug: 1900 was not a leap year
      return dfFormat(excelEpoch, "yyyy-MM-dd");
    }
  }

  // Try all format strings
  const refDate = new Date();
  for (const fmt of DATE_FORMATS) {
    try {
      const parsed = dfParse(cleaned, fmt, refDate);
      if (dfIsValid(parsed) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100) {
        return dfFormat(parsed, "yyyy-MM-dd");
      }
    } catch {
      // try next format
    }
  }

  return null;
}

// ── Phone normalisation ────────────────────────────────────────

/** Strip everything except digits. Returns empty string if falsy. */
export function normalisePhone(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw.replace(/\D/g, "");
}

// ── Email normalisation ────────────────────────────────────────

export function normaliseEmail(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw.trim().toLowerCase();
}

// ── Template CSV generation ────────────────────────────────────

export function generateTemplateCsv(
  headers: string[],
  exampleRows: string[][]
): string {
  const lines = [
    headers.join(","),
    ...exampleRows.map((row) =>
      row.map((cell) => (cell.includes(",") ? `"${cell}"` : cell)).join(",")
    ),
  ];
  return lines.join("\n");
}

export function triggerCsvDownload(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Error row accumulator ──────────────────────────────────────

export interface RowError {
  row: number;
  reason: string;
}

export function errorsToCSV(errors: RowError[]): string {
  return generateTemplateCsv(
    ["Row", "Reason"],
    errors.map((e) => [String(e.row), e.reason])
  );
}
