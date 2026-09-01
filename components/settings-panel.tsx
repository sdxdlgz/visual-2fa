"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArchiveRestore,
  Check,
  Database,
  Download,
  FileKey,
  HardDrive,
  KeyRound,
  Laptop,
  LoaderCircle,
  LockKeyhole,
  Settings2,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { apiFetch } from "@/lib/client/api";
import { createBackup, downloadBackup, parseBackup, restoreBackup } from "@/lib/client/backup";
import { rewrapVaultKey } from "@/lib/client/crypto";
import type { EncryptedItemRecord, SessionSummary, VaultBackup, VaultItem, VaultPreferences } from "@/lib/shared/types";

interface SettingsPanelProps {
  open: boolean;
  vaultKey: CryptoKey;
  records: EncryptedItemRecord[];
  items: VaultItem[];
  preferences: VaultPreferences;
  onClose: () => void;
  onPreferencesChange: (value: VaultPreferences) => void;
  onReload: () => Promise<void>;
  onSensitiveAction: (title: string, action: () => Promise<void> | void) => void;
}

type Tab = "preferences" | "backup" | "security";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function SettingsPanel({
  open,
  vaultKey,
  records,
  items,
  preferences,
  onClose,
  onPreferencesChange,
  onReload,
  onSensitiveAction,
}: SettingsPanelProps) {
  const [tab, setTab] = useState<Tab>("preferences");
  const [draft, setDraft] = useState(preferences);
  const [busy, setBusy] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupConfirm, setBackupConfirm] = useState("");
  const [includeTrash, setIncludeTrash] = useState(true);
  const [importBackup, setImportBackup] = useState<VaultBackup | null>(null);
  const [importPassword, setImportPassword] = useState("");
  const [importStrategy, setImportStrategy] = useState<"skip" | "replace">("skip");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(preferences);
    setError("");
    if (tab === "security") {
      void apiFetch<{ sessions: SessionSummary[] }>("/api/auth/sessions").then((result) => setSessions(result.sessions)).catch(() => undefined);
    }
  }, [open, preferences, tab]);

  const activeRecords = useMemo(() => (includeTrash ? records : records.filter((record) => !record.deletedAt)), [includeTrash, records]);

  const savePreferences = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch<{ preferences: VaultPreferences }>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(draft),
      });
      onPreferencesChange(response.preferences);
      toast.success("偏好设置已保存");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const exportBackup = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (backupPassword.length < 12) {
      setError("备份密码至少需要 12 个字符");
      return;
    }
    if (backupPassword !== backupConfirm) {
      setError("两次输入的备份密码不一致");
      return;
    }
    setBusy(true);
    try {
      const content = await createBackup(activeRecords, vaultKey, backupPassword);
      downloadBackup(content);
      setBackupPassword("");
      setBackupConfirm("");
      toast.success("加密备份已生成", { description: `${activeRecords.length} 条记录；请妥善保存备份密码。` });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法生成备份");
    } finally {
      setBusy(false);
    }
  };

  const selectBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError("备份文件不能超过 20MB");
      return;
    }
    try {
      const parsed = parseBackup(await file.text());
      setImportBackup(parsed);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取备份");
    }
  };

  const importSelectedBackup = async () => {
    if (!importBackup || !importPassword) return;
    setBusy(true);
    setError("");
    try {
      const restored = await restoreBackup(importBackup, importPassword, vaultKey, items, importStrategy);
      if (restored.records.length) {
        await apiFetch("/api/entries/batch", {
          method: "POST",
          body: JSON.stringify({ items: restored.records, strategy: importStrategy }),
        });
      }
      await onReload();
      toast.success("备份导入完成", {
        description: `导入 ${restored.records.length} 条，跳过 ${restored.skipped} 条重复记录。`,
      });
      setImportBackup(null);
      setImportPassword("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法解密或导入备份");
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (newPassword.length < 12) {
      setError("新主密码至少需要 12 个字符");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setError("两次输入的新主密码不一致");
      return;
    }
    setBusy(true);
    try {
      const envelope = await rewrapVaultKey(vaultKey, newPassword);
      await apiFetch("/api/auth/password", {
        method: "PUT",
        body: JSON.stringify({ currentPassword, newPassword, envelope, revokeOtherSessions: true }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      toast.success("主密码已更新", { description: "其他设备上的会话已注销，保险库数据密钥保持不变。" });
      const result = await apiFetch<{ sessions: SessionSummary[] }>("/api/auth/sessions");
      setSessions(result.sessions);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法修改主密码");
    } finally {
      setBusy(false);
    }
  };

  const revokeOthers = () => {
    onSensitiveAction("注销其他设备", async () => {
      const result = await apiFetch<{ revoked: number }>("/api/auth/sessions", { method: "DELETE" });
      toast.success(`已注销 ${result.revoked} 个其他会话`);
      const next = await apiFetch<{ sessions: SessionSummary[] }>("/api/auth/sessions");
      setSessions(next.sessions);
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="保险库设置" eyebrow="CONTROL & RECOVERY" size="large">
      <div className="settings-layout">
        <nav className="settings-tabs" aria-label="设置页面">
          <button className={tab === "preferences" ? "active" : ""} type="button" onClick={() => setTab("preferences")}><Settings2 size={17} />偏好与锁定</button>
          <button className={tab === "backup" ? "active" : ""} type="button" onClick={() => setTab("backup")}><HardDrive size={17} />备份与恢复</button>
          <button className={tab === "security" ? "active" : ""} type="button" onClick={() => setTab("security")}><ShieldCheck size={17} />安全与会话</button>
        </nav>

        <div className="settings-content">
          {tab === "preferences" && (
            <section className="settings-section">
              <header><p className="eyebrow">BEHAVIOR</p><h3>取码与自动锁定</h3><p>这些偏好会跟随保险库，在不同设备上保持一致。</p></header>
              <div className="settings-grid">
                <label>
                  <span>无操作后锁定</span>
                  <select value={draft.autoLockMinutes} onChange={(event) => setDraft({ ...draft, autoLockMinutes: Number(event.target.value) })}>
                    {[1, 5, 10, 30, 60, 120].map((value) => <option key={value} value={value}>{value} 分钟</option>)}
                  </select>
                </label>
                <label>
                  <span>页面进入后台后锁定</span>
                  <select value={draft.backgroundLockMinutes} onChange={(event) => setDraft({ ...draft, backgroundLockMinutes: Number(event.target.value) })}>
                    <option value={0}>不自动锁定</option><option value={1}>1 分钟</option><option value={5}>5 分钟</option><option value={10}>10 分钟</option><option value={30}>30 分钟</option>
                  </select>
                </label>
                <label>
                  <span>尝试清除剪贴板</span>
                  <select value={draft.clipboardClearSeconds} onChange={(event) => setDraft({ ...draft, clipboardClearSeconds: Number(event.target.value) })}>
                    <option value={0}>不尝试</option><option value={15}>15 秒</option><option value={30}>30 秒</option><option value={60}>60 秒</option>
                  </select>
                </label>
                <label>
                  <span>列表密度</span>
                  <select value={draft.viewMode} onChange={(event) => setDraft({ ...draft, viewMode: event.target.value as VaultPreferences["viewMode"] })}>
                    <option value="compact">紧凑</option><option value="comfortable">舒适</option>
                  </select>
                </label>
                <label>
                  <span>默认排序</span>
                  <select value={draft.sortMode} onChange={(event) => setDraft({ ...draft, sortMode: event.target.value as VaultPreferences["sortMode"] })}>
                    <option value="favorite">收藏优先 + 名称</option><option value="name">名称</option><option value="recent">最近使用</option><option value="created">最近添加</option>
                  </select>
                </label>
              </div>
              <div className="instruction-card subtle-card"><ShieldCheck size={19} /><p>浏览器不保证后台页面能可靠覆盖系统剪贴板；清除动作属于“尽力而为”。</p></div>
              {error && <div className="form-error">{error}</div>}
              <button className="primary-button" type="button" onClick={savePreferences} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}保存偏好</button>
            </section>
          )}

          {tab === "backup" && (
            <section className="settings-section backup-settings">
              <header><p className="eyebrow">PORTABLE RECOVERY</p><h3>加密备份</h3><p>备份文件包含密文和独立包装的数据密钥，不包含明文验证码资料。</p></header>
              <form className="backup-card" onSubmit={exportBackup}>
                <div className="backup-card-title"><Download size={21} /><div><strong>导出 `.v2fa` 备份</strong><small>{activeRecords.length} 条记录待导出</small></div></div>
                <label className="check-label"><input type="checkbox" checked={includeTrash} onChange={(event) => setIncludeTrash(event.target.checked)} /><span>包含回收站内容</span></label>
                <div className="form-grid">
                  <label><span className="field-label">独立备份密码</span><input type="password" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} minLength={12} maxLength={128} autoComplete="new-password" required /></label>
                  <label><span className="field-label">确认备份密码</span><input type="password" value={backupConfirm} onChange={(event) => setBackupConfirm(event.target.value)} minLength={12} maxLength={128} autoComplete="new-password" required /></label>
                </div>
                <button className="secondary-button" type="submit" disabled={busy || !records.length}><FileKey size={16} />生成加密备份</button>
              </form>

              <div className="backup-card">
                <div className="backup-card-title"><Upload size={21} /><div><strong>恢复加密备份</strong><small>先验证，再合并到当前保险库</small></div></div>
                {!importBackup ? (
                  <label className="file-picker"><ArchiveRestore size={20} /><span>选择 `.v2fa` 文件</span><input type="file" accept=".v2fa,.json,application/json" onChange={selectBackup} hidden /></label>
                ) : (
                  <div className="import-summary">
                    <div><Database size={18} /><span><strong>{importBackup.items.length} 条加密记录</strong><small>导出于 {formatDate(importBackup.exportedAt)}</small></span></div>
                    <label><span className="field-label">备份密码</span><input type="password" value={importPassword} onChange={(event) => setImportPassword(event.target.value)} autoComplete="current-password" /></label>
                    <div className="segmented-control">
                      <button type="button" className={importStrategy === "skip" ? "active" : ""} onClick={() => setImportStrategy("skip")}>跳过重复项</button>
                      <button type="button" className={importStrategy === "replace" ? "active" : ""} onClick={() => setImportStrategy("replace")}>覆盖同 ID 项</button>
                    </div>
                    <div className="modal-actions">
                      <button type="button" className="text-button" onClick={() => setImportBackup(null)}>重新选择</button>
                      <button type="button" className="primary-button" onClick={importSelectedBackup} disabled={busy || !importPassword}>{busy ? <LoaderCircle className="spin" size={17} /> : <ArchiveRestore size={17} />}验证并导入</button>
                    </div>
                  </div>
                )}
              </div>
              {error && <div className="form-error">{error}</div>}
            </section>
          )}

          {tab === "security" && (
            <section className="settings-section security-settings">
              <header><p className="eyebrow">ACCESS CONTROL</p><h3>主密码与活动会话</h3><p>修改主密码只会重新包装随机数据密钥，不会让服务端接触明文。</p></header>
              <form className="security-card" onSubmit={changePassword}>
                <div className="backup-card-title"><LockKeyhole size={21} /><div><strong>修改主密码</strong><small>完成后自动注销其他设备</small></div></div>
                <label><span className="field-label">当前主密码</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
                <div className="form-grid">
                  <label><span className="field-label">新主密码</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={12} maxLength={128} autoComplete="new-password" required /></label>
                  <label><span className="field-label">确认新主密码</span><input type="password" value={newPasswordConfirm} onChange={(event) => setNewPasswordConfirm(event.target.value)} minLength={12} maxLength={128} autoComplete="new-password" required /></label>
                </div>
                <button type="submit" className="secondary-button" disabled={busy}><KeyRound size={16} />更新主密码</button>
              </form>

              <div className="security-card sessions-card">
                <div className="backup-card-title"><Laptop size={21} /><div><strong>活动会话</strong><small>{sessions.length} 个已登录设备</small></div></div>
                <div className="session-list">
                  {sessions.map((session) => (
                    <div key={session.id}>
                      <Laptop size={17} />
                      <span><strong>{session.current ? "当前设备" : "其他设备"}</strong><small>{session.userAgent.slice(0, 90)}</small><small>最近活动 {formatDate(session.lastSeenAt)}</small></span>
                      {session.current && <em>CURRENT</em>}
                    </div>
                  ))}
                </div>
                <button type="button" className="secondary-button" onClick={revokeOthers} disabled={sessions.length <= 1}>注销其他设备</button>
              </div>
              {error && <div className="form-error">{error}</div>}
            </section>
          )}
        </div>
      </div>
    </Modal>
  );
}
