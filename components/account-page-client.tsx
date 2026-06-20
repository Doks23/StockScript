"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { formatDateTime, formatCurrency } from "@/lib/format";

const DEFAULT_DASHBOARD_THRESHOLDS = {
  breakEvenR: 1,
  profitableR: 2,
  riskWarnPct: 2.5,
  riskHighPct: 4,
  allocationWarnPct: 15,
  allocationHighPct: 25,
};

type DashboardThresholdSettings = typeof DEFAULT_DASHBOARD_THRESHOLDS;

function SectionCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6 ${className}`}>
      <h2 className="mb-4 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 sm:mb-5 sm:text-xs">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function AccountPageClient({ user }: { user: any }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || "");
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState(user.name || "");
  const [bio, setBio] = useState(user.bio || "");
  const [saving, setSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const [capital, setCapital] = useState(user.portfolioCapital?.toString() || "100000");
  const [savingCapital, setSavingCapital] = useState(false);
  const [capitalMessage, setCapitalMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const [thresholds, setThresholds] = useState<DashboardThresholdSettings>(DEFAULT_DASHBOARD_THRESHOLDS);
  const [thresholdMessage, setThresholdMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("dashboardThresholdSettings");
      if (saved) {
        setThresholds({ ...DEFAULT_DASHBOARD_THRESHOLDS, ...JSON.parse(saved) });
      }
    } catch {
      setThresholds(DEFAULT_DASHBOARD_THRESHOLDS);
    }
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
      else { alert(data.error || "Upload failed."); }
    } catch { alert("Upload failed."); }
    finally { setUploading(false); }
  }

  async function handleSaveProfile() {
    setSaving(true);
    setProfileMessage(null);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, bio }),
      });
      const data = await res.json();
      setProfileMessage({ text: res.ok ? "Saved" : data.error || "Failed", ok: res.ok });
      if (res.ok) router.refresh();
    } catch { setProfileMessage({ text: "Failed to save", ok: false }); }
    finally { setSaving(false); }
  }

  async function handleSaveCapital() {
    setSavingCapital(true);
    setCapitalMessage(null);
    const parsed = parseFloat(capital);
    if (isNaN(parsed) || parsed <= 0) {
      setCapitalMessage({ text: "Enter a valid amount", ok: false });
      setSavingCapital(false);
      return;
    }
    try {
      const res = await fetch("/api/user/capital", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capital: parsed }),
      });
      setCapitalMessage({ text: res.ok ? "Saved" : "Failed", ok: res.ok });
      if (res.ok) router.refresh();
    } catch { setCapitalMessage({ text: "Failed", ok: false }); }
    finally { setSavingCapital(false); }
  }

  async function handleChangePassword() {
    setPasswordMessage(null);
    if (newPassword !== confirmPassword) { setPasswordMessage({ text: "Passwords do not match", ok: false }); return; }
    if (newPassword.length < 8) { setPasswordMessage({ text: "Password must be at least 8 characters", ok: false }); return; }
    setChangingPassword(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordMessage({ text: "Password changed", ok: true });
        setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      } else {
        setPasswordMessage({ text: data.error || "Failed", ok: false });
      }
    } catch { setPasswordMessage({ text: "Failed", ok: false }); }
    finally { setChangingPassword(false); }
  }

  function updateThreshold(key: keyof DashboardThresholdSettings, value: string) {
    const parsed = Number(value);
    setThresholds((c) => ({ ...c, [key]: Number.isFinite(parsed) ? parsed : c[key] }));
  }

  function saveThresholds() {
    localStorage.setItem("dashboardThresholdSettings", JSON.stringify(thresholds));
    setThresholdMessage({ text: "Saved", ok: true });
    window.dispatchEvent(new Event("dashboard-threshold-settings-updated"));
  }

  function resetThresholds() {
    setThresholds(DEFAULT_DASHBOARD_THRESHOLDS);
    localStorage.setItem("dashboardThresholdSettings", JSON.stringify(DEFAULT_DASHBOARD_THRESHOLDS));
    setThresholdMessage({ text: "Reset to defaults", ok: true });
    window.dispatchEvent(new Event("dashboard-threshold-settings-updated"));
  }

  return (
    <div className="max-w-4xl space-y-5 sm:space-y-8">
      {/* Profile Overview */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            Account
          </h1>
          <p className="mt-0.5 text-xs text-slate-400 sm:text-sm">
            Manage your profile, security, and preferences
          </p>
        </div>
      </div>

      {/* ── Profile Section ── */}
      <div className="grid gap-5 sm:gap-6 lg:grid-cols-5">
        {/* Avatar + Personal Info */}
        <div className="space-y-5 sm:space-y-6 lg:col-span-3">
          <SectionCard title="Profile Photo">
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-line bg-canvas">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt="Avatar" fill className="object-cover" unoptimized />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-slate-400">
                    {user.name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="rounded-full border border-line bg-white px-5 py-2 text-sm font-medium text-slate-600 hover:border-accent hover:text-accent transition disabled:opacity-50"
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
                    className="text-xs text-slate-400 hover:text-loss transition"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Personal Info">
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  placeholder="Tell us about yourself..."
                  className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="rounded-full bg-accent px-6 py-2 text-sm font-medium text-white hover:bg-accentDeep transition disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                {profileMessage && (
                  <span className={`text-sm ${profileMessage.ok ? "text-profit" : "text-loss"}`}>
                    {profileMessage.text}
                  </span>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Portfolio Capital">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs text-slate-500 mb-1.5">Trading Capital (₹)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={capital}
                  onChange={(e) => setCapital(e.target.value)}
                  className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  Current: {formatCurrency(user.portfolioCapital || 0)}
                </p>
              </div>
              <div className="flex items-center gap-2 self-end pb-0.5">
                <button
                  type="button"
                  onClick={handleSaveCapital}
                  disabled={savingCapital}
                  className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accentDeep transition disabled:opacity-50"
                >
                  {savingCapital ? "Saving..." : "Update"}
                </button>
                {capitalMessage && (
                  <span className={`text-sm ${capitalMessage.ok ? "text-profit" : "text-loss"}`}>
                    {capitalMessage.text}
                  </span>
                )}
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── Account Details Sidebar ── */}
        <div className="space-y-5 sm:space-y-6 lg:col-span-2">
          <SectionCard title="Account Details">
            <div className="space-y-3.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Email</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-700 truncate max-w-[140px]">{user.email}</span>
                  {user.emailVerifiedAt ? (
                    <span className="rounded-full bg-profit/10 px-2 py-0.5 text-[10px] font-medium text-profit">Verified</span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">Unverified</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Role</span>
                <span className="rounded-full bg-accent/10 px-3 py-0.5 text-[10px] font-medium text-accent uppercase tracking-wider">
                  {user.role === "ADMIN" ? "Admin" : user.role === "SUPER_TRADER" ? "Super Trader" : "Trader"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Status</span>
                <span className={`rounded-full px-3 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                  user.approvalStatus === "APPROVED"
                    ? "bg-profit/10 text-profit"
                    : user.approvalStatus === "REJECTED"
                      ? "bg-loss/10 text-loss"
                      : "bg-amber-50 text-amber-600"
                }`}>
                  {user.approvalStatus || "PENDING"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Capital</span>
                <span className="font-mono text-sm font-medium text-ink">
                  {formatCurrency(user.portfolioCapital || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Member Since</span>
                <span className="text-slate-700 text-xs">{formatDateTime(user.createdAt)}</span>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── Security Section ── */}
      <div className="grid gap-5 sm:gap-6 lg:grid-cols-2">
        <SectionCard title="Change Password">
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleChangePassword}
                disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                className="rounded-full bg-accent px-6 py-2 text-sm font-medium text-white hover:bg-accentDeep transition disabled:opacity-50"
              >
                {changingPassword ? "Changing..." : "Change Password"}
              </button>
              {passwordMessage && (
                <span className={`text-sm ${passwordMessage.ok ? "text-profit" : "text-loss"}`}>
                  {passwordMessage.text}
                </span>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Session">
          <div className="space-y-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              You&apos;re signed in as <span className="font-medium text-ink">{user.email}</span>.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  router.push("/login");
                }}
                className="rounded-full border border-loss/30 bg-loss/5 px-5 py-2 text-sm font-medium text-loss hover:bg-loss/10 transition"
              >
                Sign Out
              </button>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ── Dashboard Preferences ── */}
      <SectionCard title="Dashboard Thresholds">
        <p className="mb-4 text-xs leading-relaxed text-slate-500">
          These thresholds control how your dashboard highlights risk, allocation, and trade quality. 
          Values outside these ranges are color-coded for quick scanning.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-line bg-canvas/50 p-3.5">
            <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500 mb-1.5">
              BreakEven from R
            </label>
            <input
              type="number" step="0.1"
              value={thresholds.breakEvenR}
              onChange={(e) => updateThreshold("breakEvenR", e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <p className="mt-1 text-[9px] text-slate-400">Trades with R-multiple below this are shown as break-even</p>
          </div>
          <div className="rounded-xl border border-line bg-canvas/50 p-3.5">
            <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500 mb-1.5">
              Profitable above R
            </label>
            <input
              type="number" step="0.1"
              value={thresholds.profitableR}
              onChange={(e) => updateThreshold("profitableR", e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <p className="mt-1 text-[9px] text-slate-400">Trades above this R-multiple are marked as profitable</p>
          </div>
          <div className="rounded-xl border border-line bg-canvas/50 p-3.5">
            <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500 mb-1.5">
              Risk Warning %
            </label>
            <input
              type="number" step="0.1"
              value={thresholds.riskWarnPct}
              onChange={(e) => updateThreshold("riskWarnPct", e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <p className="mt-1 text-[9px] text-slate-400">Risk % above this triggers a warning highlight</p>
          </div>
          <div className="rounded-xl border border-line bg-canvas/50 p-3.5">
            <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500 mb-1.5">
              Risk High %
            </label>
            <input
              type="number" step="0.1"
              value={thresholds.riskHighPct}
              onChange={(e) => updateThreshold("riskHighPct", e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <p className="mt-1 text-[9px] text-slate-400">Risk % above this is marked as high / dangerous</p>
          </div>
          <div className="rounded-xl border border-line bg-canvas/50 p-3.5">
            <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500 mb-1.5">
              Allocation Warning %
            </label>
            <input
              type="number" step="0.5"
              value={thresholds.allocationWarnPct}
              onChange={(e) => updateThreshold("allocationWarnPct", e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <p className="mt-1 text-[9px] text-slate-400">Capital allocation % above this triggers a warning</p>
          </div>
          <div className="rounded-xl border border-line bg-canvas/50 p-3.5">
            <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500 mb-1.5">
              Allocation High %
            </label>
            <input
              type="number" step="0.5"
              value={thresholds.allocationHighPct}
              onChange={(e) => updateThreshold("allocationHighPct", e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <p className="mt-1 text-[9px] text-slate-400">Allocation % above this is marked as excessive</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={saveThresholds}
            className="rounded-full bg-accent px-6 py-2 text-sm font-medium text-white hover:bg-accentDeep transition"
          >
            Save Settings
          </button>
          <button
            type="button"
            onClick={resetThresholds}
            className="rounded-full border border-line bg-white px-5 py-2 text-sm font-medium text-slate-500 hover:border-loss/30 hover:text-loss transition"
          >
            Reset Defaults
          </button>
          {thresholdMessage && (
            <span className={`text-sm ${thresholdMessage.ok ? "text-profit" : "text-loss"}`}>
              {thresholdMessage.text}
            </span>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
