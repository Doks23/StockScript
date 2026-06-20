"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format";

const DEFAULT_DASHBOARD_THRESHOLDS = {
  breakEvenR: 1,
  profitableR: 2,
  riskWarnPct: 2.5,
  riskHighPct: 4,
  allocationWarnPct: 15,
  allocationHighPct: 25,
};

type DashboardThresholdSettings = typeof DEFAULT_DASHBOARD_THRESHOLDS;

export function AccountPageClient({ user }: { user: any }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || "");
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState(user.name || "");
  const [bio, setBio] = useState(user.bio || "");
  const [saving, setSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [thresholds, setThresholds] = useState<DashboardThresholdSettings>(
    DEFAULT_DASHBOARD_THRESHOLDS,
  );
  const [thresholdMessage, setThresholdMessage] = useState("");

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
    if (!file.type.startsWith("image/")) {
      alert("Only image files are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5MB.");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("avatar", file);

    try {
      const res = await fetch("/api/user/avatar", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setAvatarUrl(data.avatarUrl);
        router.refresh();
      } else {
        alert(data.error || "Upload failed.");
      }
    } catch (e) {
      alert("Upload failed. Check console for details.");
      console.error("Avatar upload error:", e);
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveProfile() {
    setSaving(true);
    setProfileMessage("");
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, bio }),
      });
      const data = await res.json();
      if (res.ok) {
        setProfileMessage("Profile updated.");
        router.refresh();
      } else {
        setProfileMessage(data.error || "Failed to update.");
      }
    } catch {
      setProfileMessage("Failed to update.");
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    setPasswordMessage("");
    if (newPassword !== confirmPassword) {
      setPasswordMessage("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMessage("Password must be at least 8 characters.");
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordMessage("Password changed.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPasswordMessage(data.error || "Failed to change password.");
      }
    } catch {
      setPasswordMessage("Failed to change password.");
    } finally {
      setChangingPassword(false);
    }
  }

  function updateThreshold(key: keyof DashboardThresholdSettings, value: string) {
    const parsed = Number(value);
    setThresholds((current) => ({
      ...current,
      [key]: Number.isFinite(parsed) ? parsed : current[key],
    }));
  }

  function saveThresholds() {
    localStorage.setItem("dashboardThresholdSettings", JSON.stringify(thresholds));
    setThresholdMessage("Dashboard settings saved.");
    window.dispatchEvent(new Event("dashboard-threshold-settings-updated"));
  }

  return (
    <div className="max-w-2xl space-y-5 sm:space-y-8">
      <h1 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
        Account
      </h1>

      {/* Avatar */}
      <section className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <h2 className="mb-4 text-xs uppercase tracking-wider text-slate-500 sm:mb-5 sm:text-sm">
          Profile Photo
        </h2>
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="relative h-20 w-20 rounded-full overflow-hidden border border-line bg-canvas">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt="Avatar"
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-slate-400">
                {user.name?.charAt(0)?.toUpperCase() || "?"}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAvatarUpload(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-full border border-line bg-white px-5 py-2 text-sm font-medium text-slate-600 hover:border-accent hover:text-accent transition disabled:opacity-50"
            >
              {uploading ? "Uploading..." : avatarUrl ? "Change Photo" : "Upload Photo"}
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
      </section>

      {/* Personal Info */}
      <section className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <h2 className="mb-4 text-xs uppercase tracking-wider text-slate-500 sm:mb-5 sm:text-sm">
          Personal Info
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-500 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Bio</label>
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
              <span className={`text-sm ${profileMessage === "Profile updated." ? "text-profit" : "text-loss"}`}>
                {profileMessage}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Change Password */}
      <section className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <h2 className="mb-4 text-xs uppercase tracking-wider text-slate-500 sm:mb-5 sm:text-sm">
          Change Password
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-500 mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleChangePassword}
              disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="rounded-full bg-accent px-6 py-2 text-sm font-medium text-white hover:bg-accentDeep transition disabled:opacity-50"
            >
              {changingPassword ? "Changing..." : "Change Password"}
            </button>
            {passwordMessage && (
              <span className={`text-sm ${passwordMessage === "Password changed." ? "text-profit" : "text-loss"}`}>
                {passwordMessage}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Dashboard Settings */}
      <section className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <h2 className="mb-4 text-xs uppercase tracking-wider text-slate-500 sm:mb-5 sm:text-sm">
          Dashboard Settings
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-500 mb-1">BreakEven from R</label>
            <input
              type="number"
              step="0.1"
              value={thresholds.breakEvenR}
              onChange={(e) => updateThreshold("breakEvenR", e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Profitable above R</label>
            <input
              type="number"
              step="0.1"
              value={thresholds.profitableR}
              onChange={(e) => updateThreshold("profitableR", e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Risk warning %</label>
            <input
              type="number"
              step="0.1"
              value={thresholds.riskWarnPct}
              onChange={(e) => updateThreshold("riskWarnPct", e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Risk high %</label>
            <input
              type="number"
              step="0.1"
              value={thresholds.riskHighPct}
              onChange={(e) => updateThreshold("riskHighPct", e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Allocation warning %</label>
            <input
              type="number"
              step="0.5"
              value={thresholds.allocationWarnPct}
              onChange={(e) => updateThreshold("allocationWarnPct", e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Allocation high %</label>
            <input
              type="number"
              step="0.5"
              value={thresholds.allocationHighPct}
              onChange={(e) => updateThreshold("allocationHighPct", e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={saveThresholds}
            className="rounded-full bg-accent px-6 py-2 text-sm font-medium text-white hover:bg-accentDeep transition"
          >
            Save Dashboard Settings
          </button>
          {thresholdMessage && (
            <span className="text-sm text-profit">{thresholdMessage}</span>
          )}
        </div>
      </section>

      {/* Account Details */}
      <section className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <h2 className="mb-4 text-xs uppercase tracking-wider text-slate-500 sm:mb-5 sm:text-sm">
          Account Details
        </h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Email</span>
            <span className="text-slate-700">{user.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Role</span>
            <span className="rounded-full bg-accent/10 px-3 py-0.5 text-xs font-medium text-accent uppercase tracking-wider">
              {user.role}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Member Since</span>
            <span className="text-slate-700">
              {formatDateTime(user.createdAt)}
            </span>
          </div>
          {user.emailVerifiedAt && (
            <div className="flex justify-between">
              <span className="text-slate-500">Email Verified</span>
              <span className="text-profit">Yes</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
