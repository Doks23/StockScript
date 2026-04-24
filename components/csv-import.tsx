"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  X,
} from "lucide-react";

const BROKER_OPTIONS = [
  { key: "auto", label: "Auto-Detect" },
  { key: "generic", label: "Generic CSV" },
  { key: "zerodha", label: "Zerodha (Trade Book)" },
  { key: "groww", label: "Groww" },
  { key: "angel", label: "Angel One" },
  { key: "dhan", label: "Dhan" },
];

const SEGMENT_OPTIONS = [
  { value: "EQUITY", label: "Equity" },
  { value: "INTRADAY", label: "Intraday" },
  { value: "OPTIONS", label: "Options" },
  { value: "FUTURES", label: "Futures" },
];

type ImportResult = {
  imported: number;
  open: number;
  closed: number;
  brokerDetected: string;
  parseErrors?: string[];
};

export function CSVImport({
  competitions,
}: {
  competitions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [brokerKey, setBrokerKey] = useState("auto");
  const [segment, setSegment] = useState("EQUITY");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const previewRows = csvText
    ? csvText
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .slice(0, 6)
        .map((line) => line.split(",").map((c) => c.trim()))
    : [];

  const totalDataRows = csvText
    ? csvText.split(/\r?\n/).filter((line) => line.trim().length > 0).length - 1
    : 0;

  const handleFileRead = useCallback((file: File) => {
    setFileName(file.name);
    setResult(null);
    setError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text || "");
      setShowPreview(true);
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file && (file.name.endsWith(".csv") || file.type === "text/csv")) {
        handleFileRead(file);
      } else {
        setError("Please upload a CSV file.");
      }
    },
    [handleFileRead],
  );

  async function handleImport() {
    if (!csvText.trim()) {
      setError("No CSV data to import.");
      return;
    }

    setError("");
    setResult(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/trades/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvText,
          brokerKey: brokerKey === "auto" ? undefined : brokerKey,
          segment,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Import failed.");
        if (data.parseErrors) {
          setError(
            `${data.error}\n\nParse errors:\n${data.parseErrors.slice(0, 10).join("\n")}`,
          );
        }
      } else {
        setResult(data);
        // Refresh the page data after a short delay
        setTimeout(() => {
          router.push("/trades");
          router.refresh();
        }, 2000);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClear() {
    setCsvText("");
    setFileName("");
    setResult(null);
    setError("");
    setShowPreview(false);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors ${
          isDragOver
            ? "border-[#b18123] bg-[#fff9ec]"
            : "border-slate-300 bg-slate-50 hover:border-slate-400"
        }`}
      >
        <Upload className="h-8 w-8 text-slate-400" />
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700">
            Drop your broker CSV here, or{" "}
            <label className="cursor-pointer text-[#b18123] hover:text-[#886219] font-semibold">
              browse
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileRead(file);
                }}
              />
            </label>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Supports Zerodha, Groww, Angel One, Dhan, or generic CSV/TSV format
          </p>
        </div>

        {fileName && (
          <div className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-sm text-slate-700 shadow-sm">
            <FileText className="h-4 w-4 text-[#b18123]" />
            <span className="font-medium">{fileName}</span>
            <span className="text-slate-400">({totalDataRows} rows)</span>
            <button
              onClick={handleClear}
              className="ml-1 text-slate-400 hover:text-red-500"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Settings Row */}
      <div className="flex flex-wrap gap-3 items-center">
        <label className="flex items-center gap-2 text-sm text-slate-500">
          <span>Broker</span>
          <select
            value={brokerKey}
            onChange={(e) => setBrokerKey(e.target.value)}
            className="form-input w-[160px] bg-slate-50 text-sm h-9"
          >
            {BROKER_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-500">
          <span>Segment</span>
          <select
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            className="form-input w-[110px] bg-slate-50 text-sm h-9"
          >
            {SEGMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Preview Table */}
      {showPreview && previewRows.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${showPreview ? "" : "-rotate-90"}`}
            />
            Preview ({Math.min(5, totalDataRows)} of {totalDataRows} rows)
          </button>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs text-slate-600">
              <thead>
                <tr className="bg-slate-50">
                  {previewRows[0]?.map((header, i) => (
                    <th
                      key={i}
                      className="px-3 py-2 font-medium text-left whitespace-nowrap"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(1, 6).map((row, ri) => (
                  <tr key={ri} className="border-t border-slate-100">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-1.5 whitespace-nowrap">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <pre className="whitespace-pre-wrap font-sans">{error}</pre>
        </div>
      )}

      {/* Success */}
      {result && (
        <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">
              Successfully imported {result.imported} trade
              {result.imported !== 1 ? "s" : ""}
            </p>
            <p className="mt-1 text-emerald-700">
              {result.closed} closed · {result.open} open · Detected format:{" "}
              {result.brokerDetected}
            </p>
            {result.parseErrors && result.parseErrors.length > 0 && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2 text-amber-800 text-xs">
                <p className="font-semibold">
                  ⚠ {result.parseErrors.length} row(s) had parse warnings and
                  were skipped:
                </p>
                <ul className="list-disc pl-4 mt-1 opacity-80">
                  {result.parseErrors
                    .slice(0, 3)
                    .map((e: string, i: number) => (
                      <li key={i}>{e}</li>
                    ))}
                  {result.parseErrors.length > 3 && (
                    <li>...and {result.parseErrors.length - 3} more</li>
                  )}
                </ul>
              </div>
            )}
            <p className="mt-2 text-emerald-600 text-xs">
              Redirecting to journal...
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <p className="text-xs text-slate-400">
          {csvText
            ? `${totalDataRows} transactions detected`
            : "No file loaded"}
        </p>
        <button
          onClick={handleImport}
          disabled={isSubmitting || !csvText.trim() || !!result}
          className="rounded-xl bg-gradient-to-r from-[#d4a849] to-[#b18123] px-6 py-2.5 text-sm font-medium text-white transition hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Importing..." : "Import Trades"}
        </button>
      </div>
    </div>
  );
}
