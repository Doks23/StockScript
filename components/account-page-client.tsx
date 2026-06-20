"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { formatDateTime, formatCurrency } from "@/lib/format";
import { MetricCard } from "@/components/metric-card";

const DEFAULT_DASHBOARD_THRESHOLDS = {
  breakEvenR: 1,
  profitableR: 2,
  riskWarnPct: 2.5,
  riskHighPct: 4,
  allocationWarnPct: 15,
  allocationHighPct: 25,
};

type DashboardThresholdSettings = typeof DEFAULT_DASHBOARD_THRESHOLDS;

type StatusMsg = { text: string; ok: boolean } | null;

function Label({ children }: { children: React.ReactNode }) {
  return <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 mb-1.5">{children}</span>;
}

export function AccountPageClient({ user }: { user: any }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || "");
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState(user.name || "");
  const [bio, setBio] = useState(user.bio || "");
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<StatusMsg>(null);

  const [capital, setCapital] = useState(user.portfolioCapital?.toString() || "100000");
  const [savingCapital, setSavingCapital] = useState(false);
  const [capitalMsg, setCapitalMsg] = useState<StatusMsg>(null);

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<StatusMsg>(null);

  const [thresholds, setThresholds] = useState<DashboardThresholdSettings>(DEFAULT_DASHBOARD_THRESHOLDS);
  const [thresholdMsg, setThresholdMsg] = useState<StatusMsg>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("dashboardThresholdSettings");
      if (saved) setThresholds({ ...DEFAULT_DASHBOARD_THRESHOLDS, ...JSON.parse(saved) });
    } catch { setThresholds(DEFAULT_DASHBOARD_THRESHOLDS); }
  }, []);

  async function handleAvatarUpload(file: File) {
    if (!file.type.startsWith("image/")) { alert("Only image files are allowed."); return; }
    if (file.size > 5 * 1024 * 1024) { alert("Image must be under 5MB."); return; }
    setUploading(true);
    const formData = new FormData();
    formData.append("avatar", file);
    try {
      const res = await fetch("/api/user/avatar", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) { setAvatarUrl(data.avatarUrl); router.refresh(); }
      else alert(data.error || "Upload failed.");
    } catch { alert("Upload failed."); }
    finally { setUploading(false); }
  }

  async function handleSaveProfile() {
    setSaving(true); setProfileMsg(null);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, bio }),
      });
      const data = await res.json();
      setProfileMsg({ text: res.ok ? "Saved" : data.error || "Failed", ok: res.ok });
      if (res.ok) router.refresh();
    } catch { setProfileMsg({ text: "Failed", ok: false }); }
    finally { setSaving(false); }
  }

  async function handleSaveCapital() {
    setSavingCapital(true); setCapitalMsg(null);
    const parsed = parseFloat(capital);
    if (isNaN(parsed) || parsed <= 0) {
      setCapitalMsg({ text: "Enter a valid amount", ok: false });
      setSavingCapital(false);
      return;
    }
    try {
      const res = await fetch("/api/user/capital", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capital: parsed }),
      });
      setCapitalMsg({ text: res.ok ? "Saved" : "Failed", ok: res.ok });
      if (res.ok) router.refresh();
    } catch { setCapitalMsg({ text: "Failed", ok: false }); }
    finally { setSavingCapital(false); }
  }

  async function handleChangePassword() {
    setPwMsg(null);
    if (pwNew !== pwConfirm) { setPwMsg({ text: "Passwords do not match", ok: false }); return; }
    if (pwNew.length < 8) { setPwMsg({ text: "Minimum 8 characters", ok: false }); return; }
    setChangingPw(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      const data = await res.json();
      if (res.ok) {
        setPwMsg({ text: "Password changed", ok: true });
        setPwCurrent(""); setPwNew(""); setPwConfirm("");
      } else setPwMsg({ text: data.error || "Failed", ok: false });
    } catch { setPwMsg({ text: "Failed", ok: false }); }
    finally { setChangingPw(false); }
  }

  function updateThreshold(key: keyof DashboardThresholdSettings, value: string) {
    const parsed = Number(value);
    setThresholds((c) => ({ ...c, [key]: Number.isFinite(parsed) ? parsed : c[key] }));
  }

  function saveThresholds() {
    localStorage.setItem("dashboardThresholdSettings", JSON.stringify(thresholds));
    setThresholdMsg({ text: "Saved", ok: true });
    window.dispatchEvent(new Event("dashboard-threshold-settings-updated"));
  }

  function resetThresholds() {
    setThresholds(DEFAULT_DASHBOARD_THRESHOLDS);
    localStorage.setItem("dashboardThresholdSettings", JSON.stringify(DEFAULT_DASHBOARD_THRESHOLDS));
    setThresholdMsg({ text: "Defaults restored", ok: true });
    window.dispatchEvent(new Event("dashboard-threshold-settings-updated"));
  }

  const roleLabel = user.role === "ADMIN" ? "Admin" : user.role === "SUPER_TRADER" ? "Super Trader" : "Trader";
  const statusLabel = user.approvalStatus || "PENDING";
  const statusColor = statusLabel === "APPROVED" ? "profit" : statusLabel === "REJECTED" ? "loss" : "warning";

  return (
    <div className="max-w-5xl space-y-5 sm:space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            Account
          </h1>
          <p className="mt-0.5 text-xs text-slate-400 sm:text-sm">
            Manage your profile, security, and dashboard preferences
          </p>
        </div>
      </div>

      {/* ─── KPI Row ─── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard
          label="Portfolio Capital"
          value={formatCurrency(user.portfolioCapital || 0)}
          detail="Available trading capital"
          tone="default"
          compact
        />
        <MetricCard
          label="Role"
          value={roleLabel}
          detail={user.email}
          tone="default"
          compact
        />
        <MetricCard
          label="Status"
          value={statusLabel}
          detail={user.emailVerifiedAt ? "Email verified" : "Email unverified"}
          tone={statusColor as any}
          compact
        />
        <MetricCard
          label="Member Since"
          value={formatDateTime(user.createdAt).split(",")[0] || ""}
          detail={user.emailVerifiedAt ? "Active account" : "Pending verification"}
          tone="default"
          compact
        />
      </div>

      {/* ─── Profile Section ─── */}
      <div className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
        <p className="mb-5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 sm:text-xs">
          Profile
        </p>
        <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3 sm:w-36">
            <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-line bg-canvas shrink-0">
              {avatarUrl ? (
                <Image src={avatarUrl} alt="Avatar" fill className="object-cover" unoptimized />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-slate-400">
                  {user.name?.charAt(0)?.toUpperCase() || "?"}
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); }}
            />
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-full border border-line bg-white px-4 py-1.5 text-xs font-medium text-slate-600 hover:border-accent hover:text-accent transition disabled:opacity-50"
              >
                {uploading ? "Uploading..." : avatarUrl ? "Change" : "Upload"}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={async () => {
                    setAvatarUrl("");
                    await fetch("/api/user/avatar", { method: "DELETE" });
                    router.refresh();
                  }}
                  className="text-[10px] text-slate-400 hover:text-loss transition"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Info fields */}
          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[180px]">
                <Label>Name</Label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <div className="shrink-0 pt-5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-[10px] font-medium text-accent">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  {roleLabel}
                </span>
              </div>
            </div>
            <div>
              <Label>Bio</Label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder="Tell us about yourself..."
                className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30 resize-none"
              />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={saving}
                className="rounded-full bg-accent px-6 py-2 text-sm font-medium text-white hover:bg-accentDeep transition disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              {profileMsg && (
                <span className={`text-xs font-medium ${profileMsg.ok ? "text-profit" : "text-loss"}`}>
                  {profileMsg.text}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Portfolio Capital ─── */}
      <div className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
        <p className="mb-5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 sm:text-xs">
          Portfolio Capital
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[180px]">
            <Label>Amount (₹)</Label>
            <input
              type="number"
              min="1"
              step="1"
              value={capital}
              onChange={(e) => setCapital(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <button
            type="button"
            onClick={handleSaveCapital}
            disabled={savingCapital}
            className="rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-accentDeep transition disabled:opacity-50"
          >
            {savingCapital ? "Saving..." : "Update"}
          </button>
          {capitalMsg && (
            <span className={`text-xs font-medium ${capitalMsg.ok ? "text-profit" : "text-loss"}`}>
              {capitalMsg.text}
            </span>
          )}
        </div>
      </div>

      {/* ─── Security Section ─── */}
      <div className="grid gap-5 sm:gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
          <p className="mb-5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 sm:text-xs">
            Change Password
          </p>
          <div className="space-y-4">
            <div>
              <Label>Current Password</Label>
              <input
                type="password"
                value={pwCurrent}
                onChange={(e) => setPwCurrent(e.target.value)}
                className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <div>
              <Label>New Password</Label>
              <input
                type="password"
                value={pwNew}
                onChange={(e) => setPwNew(e.target.value)}
                className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <div>
              <Label>Confirm New Password</Label>
              <input
                type="password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleChangePassword}
                disabled={changingPw || !pwCurrent || !pwNew || !pwConfirm}
                className="rounded-full bg-accent px-6 py-2 text-sm font-medium text-white hover:bg-accentDeep transition disabled:opacity-50"
              >
                {changingPw ? "Changing..." : "Change Password"}
              </button>
              {pwMsg && (
                <span className={`text-xs font-medium ${pwMsg.ok ? "text-profit" : "text-loss"}`}>
                  {pwMsg.text}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
          <p className="mb-5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 sm:text-xs">
            Session
          </p>
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl bg-canvas/60 px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                {user.name?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink truncate">{user.name}</p>
                <p className="text-xs text-slate-400 truncate">{user.email}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                router.push("/login");
              }}
              className="w-full rounded-full border border-loss/20 bg-loss/5 px-5 py-2.5 text-sm font-medium text-loss hover:bg-loss/10 transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* ─── Dashboard Thresholds ─── */}
      <div className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
        <p className="mb-4 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 sm:text-xs">
          Dashboard Thresholds
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {/* R-Multiple */}
          <div className="rounded-xl border border-line/70 bg-canvas/30 p-3">
            <p className="mb-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              R-Multiple
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <span className="block text-[9px] text-slate-400 mb-1">BreakEven</span>
                <input
                  type="number" step="0.1"
                  value={thresholds.breakEvenR}
                  onChange={(e) => updateThreshold("breakEvenR", e.target.value)}
                  className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <span className="text-[9px] text-slate-300 mt-5">to</span>
              <div className="flex-1">
                <span className="block text-[9px] text-slate-400 mb-1">Profitable</span>
                <input
                  type="number" step="0.1"
                  value={thresholds.profitableR}
                  onChange={(e) => updateThreshold("profitableR", e.target.value)}
                  className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </div>
            </div>
          </div>

          {/* Risk */}
          <div className="rounded-xl border border-line/70 bg-canvas/30 p-3">
            <p className="mb-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Risk
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <span className="block text-[9px] text-slate-400 mb-1">Warning</span>
                <input
                  type="number" step="0.1"
                  value={thresholds.riskWarnPct}
                  onChange={(e) => updateThreshold("riskWarnPct", e.target.value)}
                  className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <span className="text-[9px] text-slate-300 mt-5">to</span>
              <div className="flex-1">
                <span className="block text-[9px] text-slate-400 mb-1">High</span>
                <input
                  type="number" step="0.1"
                  value={thresholds.riskHighPct}
                  onChange={(e) => updateThreshold("riskHighPct", e.target.value)}
                  className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </div>
            </div>
          </div>

          {/* Allocation */}
          <div className="rounded-xl border border-line/70 bg-canvas/30 p-3">
            <p className="mb-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Allocation
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <span className="block text-[9px] text-slate-400 mb-1">Warning</span>
                <input
                  type="number" step="0.5"
                  value={thresholds.allocationWarnPct}
                  onChange={(e) => updateThreshold("allocationWarnPct", e.target.value)}
                  className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <span className="text-[9px] text-slate-300 mt-5">to</span>
              <div className="flex-1">
                <span className="block text-[9px] text-slate-400 mb-1">High</span>
                <input
                  type="number" step="0.5"
                  value={thresholds.allocationHighPct}
                  onChange={(e) => updateThreshold("allocationHighPct", e.target.value)}
                  className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={saveThresholds}
            className="rounded-full bg-accent px-5 py-1.5 text-xs font-medium text-white hover:bg-accentDeep transition"
          >
            Save Settings
          </button>
          <button
            type="button"
            onClick={resetThresholds}
            className="rounded-full border border-line bg-white px-4 py-1.5 text-xs font-medium text-slate-500 hover:border-loss/30 hover:text-loss transition"
          >
            Reset
          </button>
          {thresholdMsg && (
            <span className={`text-xs font-medium ${thresholdMsg.ok ? "text-profit" : "text-loss"}`}>
              {thresholdMsg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
