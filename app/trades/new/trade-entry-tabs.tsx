"use client";

import { useState } from "react";
import { PencilLine, Upload } from "lucide-react";

export function TradeEntryTabs({
  manualForm,
  importForm,
}: {
  manualForm: React.ReactNode;
  importForm: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<"manual" | "import">("manual");

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("manual")}
          className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition ${
            activeTab === "manual"
              ? "bg-ink text-white shadow-md"
              : "border border-line bg-white text-slate-600 hover:border-accent hover:text-accent"
          }`}
        >
          <PencilLine className="h-4 w-4" />
          Manual Entry
        </button>
        <button
          onClick={() => setActiveTab("import")}
          className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition ${
            activeTab === "import"
              ? "bg-ink text-white shadow-md"
              : "border border-line bg-white text-slate-600 hover:border-accent hover:text-accent"
          }`}
        >
          <Upload className="h-4 w-4" />
          Import from Broker
        </button>
      </div>

      {activeTab === "manual" ? manualForm : importForm}
    </div>
  );
}
