"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArchiveRestore,
  ChevronsUpDown,
  Clock3,
  Folder,
  KeyRound,
  LayoutList,
  Lock,
  LogOut,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Vault,
} from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand-mark";
import { EntryDetail } from "@/components/entry-detail";
import { EntryDialog } from "@/components/entry-dialog";
import { OtpRow } from "@/components/otp-row";
import { ReauthDialog } from "@/components/reauth-dialog";
import { SettingsPanel } from "@/components/settings-panel";
import { apiFetch, ApiClientError } from "@/lib/client/api";
import { decryptVaultItem, encryptVaultItem } from "@/lib/client/crypto";
import { otpTimeRemaining } from "@/lib/client/otp";
import type { EncryptedItemRecord, VaultItem, VaultPreferences } from "@/lib/shared/types";

interface VaultDashboardProps {
  username: string;
  vaultKey: CryptoKey;
  preferences: VaultPreferences;
  onPreferencesChange: (value: VaultPreferences) => void;
  onLock: () => void;
  onLogout: () => Promise<void>;
}

interface DecryptedEntry {
  record: EncryptedItemRecord;
  item: VaultItem;
}

type View = "all" | "favorites" | "recent" | "trash" | `group:${string}`;
interface ReauthAction {
  title: string;
  action: () => Promise<void> | void;
}

function viewTitle(view: View): { eyebrow: string; title: string; description: string } {
  if (view === "favorites") return { eyebrow: "PRIORITY", title: "收藏", description: "你最常使用的验证器仪表。" };
  if (view === "recent") return { eyebrow: "ACTIVITY", title: "最近使用", description: "按最近复制验证码的时间排列。" };
  if (view === "trash") return { eyebrow: "QUARANTINE", title: "回收站", description: "恢复条目，或在重新验证后永久删除。" };
  if (view.startsWith("group:")) {
    const group = view.slice(6);
    return { eyebrow: "COLLECTION", title: group, description: `分组“${group}”中的验证器。` };
  }
  return { eyebrow: "LIVE INSTRUMENTS", title: "验证码", description: "所有验证器都已在此浏览器内解密。" };
}

function sortEntries(entries: DecryptedEntry[], mode: VaultPreferences["sortMode"]): DecryptedEntry[] {
  return [...entries].sort((left, right) => {
    if (mode === "favorite" && left.item.favorite !== right.item.favorite) return left.item.favorite ? -1 : 1;
    if (mode === "recent") return (right.record.lastUsedAt || "").localeCompare(left.record.lastUsedAt || "");
    if (mode === "created") return right.record.createdAt.localeCompare(left.record.createdAt);
    return left.item.issuer.localeCompare(right.item.issuer, "zh-CN", { sensitivity: "base" }) || left.item.accountName.localeCompare(right.item.accountName, "zh-CN");
  });
}

export function VaultDashboard({ username, vaultKey, preferences, onPreferencesChange, onLock, onLogout }: VaultDashboardProps) {
  const [entries, setEntries] = useState<DecryptedEntry[]>([]);
  const [records, setRecords] = useState<EncryptedItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reauthAction, setReauthAction] = useState<ReauthAction | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch<{ items: EncryptedItemRecord[] }>("/api/entries");
      const decrypted = await Promise.allSettled(response.items.map(async (record) => ({ record, item: await decryptVaultItem(vaultKey, record) })));
      const valid = decrypted.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
      const damaged = decrypted.length - valid.length;
      setRecords(response.items);
      setEntries(valid);
      if (damaged) toast.error(`${damaged} 条记录无法解密`, { description: "记录可能损坏或来自其他保险库；加密备份仍会保留它们。" });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        await onLogout();
        return;
      }
      toast.error("无法读取验证器", { description: error instanceof Error ? error.message : "请稍后重试" });
    } finally {
      setLoading(false);
    }
  }, [onLogout, vaultKey]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  const activeEntries = useMemo(() => entries.filter((entry) => !entry.record.deletedAt), [entries]);
  const trashEntries = useMemo(() => entries.filter((entry) => entry.record.deletedAt), [entries]);
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    activeEntries.forEach(({ item }) => {
      if (item.group) counts.set(item.group, (counts.get(item.group) || 0) + 1);
    });
    return [...counts].sort(([left], [right]) => left.localeCompare(right, "zh-CN"));
  }, [activeEntries]);
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    activeEntries.forEach(({ item }) => item.tags.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1)));
    return [...counts].sort((left, right) => right[1] - left[1]).slice(0, 8);
  }, [activeEntries]);

  const visibleEntries = useMemo(() => {
    let selected = view === "trash" ? trashEntries : activeEntries;
    if (view === "favorites") selected = selected.filter(({ item }) => item.favorite);
    if (view === "recent") selected = selected.filter(({ record }) => record.lastUsedAt);
    if (view.startsWith("group:")) selected = selected.filter(({ item }) => item.group === view.slice(6));
    if (tag) selected = selected.filter(({ item }) => item.tags.includes(tag));
    const query = search.trim().toLocaleLowerCase("zh-CN");
    if (query) {
      selected = selected.filter(({ item }) =>
        [item.issuer, item.accountName, item.group, item.notes, ...item.tags].some((value) => value.toLocaleLowerCase("zh-CN").includes(query)),
      );
    }
    return sortEntries(selected, view === "recent" ? "recent" : preferences.sortMode);
  }, [activeEntries, preferences.sortMode, search, tag, trashEntries, view]);

  const selected = useMemo(() => entries.find((entry) => entry.item.id === detailId) || null, [detailId, entries]);
  const editing = useMemo(() => entries.find((entry) => entry.item.id === editId)?.item || null, [editId, entries]);
  const heading = viewTitle(view);

  const upsertLocal = (record: EncryptedItemRecord, item: VaultItem) => {
    setRecords((current) => [...current.filter((value) => value.id !== record.id), record]);
    setEntries((current) => [...current.filter((value) => value.item.id !== item.id), { record, item }]);
  };

  const saveItem = async (item: VaultItem) => {
    const existing = entries.find((entry) => entry.item.id === item.id);
    const encrypted = await encryptVaultItem(vaultKey, item, existing?.record);
    if (existing) {
      const response = await apiFetch<{ item: EncryptedItemRecord }>(`/api/entries/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ version: encrypted.version, ciphertext: encrypted.ciphertext, iv: encrypted.iv }),
      });
      upsertLocal(response.item, item);
      toast.success("验证器已更新");
    } else {
      const response = await apiFetch<{ item: EncryptedItemRecord }>("/api/entries", {
        method: "POST",
        body: JSON.stringify({ id: encrypted.id, version: encrypted.version, ciphertext: encrypted.ciphertext, iv: encrypted.iv, sortOrder: records.length }),
      });
      upsertLocal(response.item, item);
      toast.success("验证器已安全添加");
    }
  };

  const updateItem = async (item: VaultItem) => {
    await saveItem({ ...item, updatedAt: new Date().toISOString() });
  };

  const patchRecord = async (id: string, patch: Partial<Pick<EncryptedItemRecord, "deletedAt" | "lastUsedAt" | "sortOrder">>) => {
    const response = await apiFetch<{ item: EncryptedItemRecord }>(`/api/entries/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    setRecords((current) => current.map((record) => (record.id === id ? response.item : record)));
    setEntries((current) => current.map((entry) => (entry.item.id === id ? { ...entry, record: response.item } : entry)));
  };

  const copyCode = async (item: VaultItem, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      const remaining = item.type === "totp" ? otpTimeRemaining(item.period) : null;
      toast.success("验证码已复制", { description: remaining ? `${remaining} 秒后失效` : `HOTP 计数器 ${item.counter}` });
      const lastUsedAt = new Date().toISOString();
      void patchRecord(item.id, { lastUsedAt }).catch(() => undefined);
      if (preferences.clipboardClearSeconds > 0) {
        window.setTimeout(async () => {
          try {
            if ((await navigator.clipboard.readText()) === code) await navigator.clipboard.writeText("");
          } catch {
            // Clipboard reading/clearing is best effort and often blocked by browsers.
          }
        }, preferences.clipboardClearSeconds * 1_000);
      }
    } catch {
      toast.error("无法访问剪贴板", { description: "请允许当前站点使用剪贴板。" });
    }
  };

  const toggleFavorite = async (item: VaultItem) => {
    await updateItem({ ...item, favorite: !item.favorite });
  };

  const nextHotp = async (item: VaultItem) => {
    await updateItem({ ...item, counter: item.counter + 1 });
  };

  const restoreItem = async (id: string) => {
    await patchRecord(id, { deletedAt: null });
    toast.success("验证器已恢复");
  };

  const moveToTrash = async (item: VaultItem) => {
    await apiFetch(`/api/entries/${item.id}`, { method: "DELETE" });
    const deletedAt = new Date().toISOString();
    setRecords((current) => current.map((record) => (record.id === item.id ? { ...record, deletedAt } : record)));
    setEntries((current) => current.map((entry) => (entry.item.id === item.id ? { ...entry, record: { ...entry.record, deletedAt } } : entry)));
    setDetailId(null);
    toast("已移入回收站", { action: { label: "撤销", onClick: () => void restoreItem(item.id) } });
  };

  const permanentDelete = (item: VaultItem) => {
    setReauthAction({
      title: "永久删除验证器",
      action: async () => {
        await apiFetch(`/api/entries/${item.id}?permanent=true`, { method: "DELETE" });
        setRecords((current) => current.filter((record) => record.id !== item.id));
        setEntries((current) => current.filter((entry) => entry.item.id !== item.id));
        toast.success("验证器已永久删除");
      },
    });
  };

  const emptyTrash = () => {
    if (!trashEntries.length) return;
    setReauthAction({
      title: "清空回收站",
      action: async () => {
        await Promise.all(trashEntries.map(({ item }) => apiFetch(`/api/entries/${item.id}?permanent=true`, { method: "DELETE" })));
        const ids = new Set(trashEntries.map(({ item }) => item.id));
        setRecords((current) => current.filter((record) => !ids.has(record.id)));
        setEntries((current) => current.filter((entry) => !ids.has(entry.item.id)));
        toast.success(`已永久删除 ${ids.size} 条记录`);
      },
    });
  };

  const sensitiveAction = (title: string, action: () => Promise<void> | void) => setReauthAction({ title, action });

  return (
    <main className="vault-shell">
      <aside className="vault-sidebar">
        <div className="sidebar-brand"><BrandMark /><span className="vault-status"><i /> VAULT UNLOCKED</span></div>
        <nav className="primary-nav" aria-label="保险库导航">
          <button type="button" className={view === "all" ? "active" : ""} onClick={() => setView("all")}><Vault size={18} /><span>全部验证码</span><em>{activeEntries.length}</em></button>
          <button type="button" className={view === "favorites" ? "active" : ""} onClick={() => setView("favorites")}><Star size={18} /><span>收藏</span><em>{activeEntries.filter(({ item }) => item.favorite).length}</em></button>
          <button type="button" className={view === "recent" ? "active" : ""} onClick={() => setView("recent")}><Clock3 size={18} /><span>最近使用</span></button>
        </nav>

        <div className="sidebar-section">
          <header><span>分组</span></header>
          <nav>
            {groups.map(([group, count]) => (
              <button key={group} type="button" className={view === `group:${group}` ? "active" : ""} onClick={() => setView(`group:${group}`)}>
                <Folder size={16} /><span>{group}</span><em>{count}</em>
              </button>
            ))}
            {!groups.length && <p className="sidebar-empty">添加条目时可创建分组</p>}
          </nav>
        </div>

        <div className="sidebar-spacer" />
        <nav className="secondary-nav">
          <button type="button" className={view === "trash" ? "active" : ""} onClick={() => setView("trash")}><Trash2 size={17} /><span>回收站</span>{trashEntries.length > 0 && <em>{trashEntries.length}</em>}</button>
          <button type="button" onClick={() => setSettingsOpen(true)}><Settings size={17} /><span>设置与备份</span></button>
        </nav>
        <div className="sidebar-user">
          <span className="user-avatar">{username[0]?.toUpperCase()}</span>
          <span><strong>{username}</strong><small>OWNER · ENCRYPTED</small></span>
          <button type="button" className="icon-button" onClick={onLogout} aria-label="退出登录"><LogOut size={17} /></button>
        </div>
      </aside>

      <section className="vault-workspace">
        <header className="workspace-topbar">
          <div className="search-control">
            <Search size={18} aria-hidden="true" />
            <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索服务、账户、分组、标签或备注" aria-label="搜索验证器" />
            <kbd>⌘ K</kbd>
          </div>
          <button className="icon-button topbar-lock" type="button" onClick={onLock} aria-label="锁定保险库"><Lock size={18} /></button>
          <button className="primary-button add-button" type="button" onClick={() => { setEditId(null); setEntryDialogOpen(true); }}><Plus size={18} />添加验证器</button>
        </header>

        <div className="workspace-content">
          <header className="workspace-heading">
            <div><p className="eyebrow">{heading.eyebrow}</p><h1>{heading.title}</h1><p>{heading.description}</p></div>
            <div className="workspace-heading-meta"><span><ShieldCheck size={15} /> 浏览器内解密</span><span>{visibleEntries.length.toString().padStart(2, "0")} ITEMS</span></div>
          </header>

          {tags.length > 0 && view !== "trash" && (
            <div className="filter-strip">
              <button type="button" className={!tag ? "active" : ""} onClick={() => setTag(null)}>全部标签</button>
              {tags.map(([value, count]) => <button type="button" key={value} className={tag === value ? "active" : ""} onClick={() => setTag(tag === value ? null : value)}>#{value}<span>{count}</span></button>)}
              <div className="sort-readout"><ChevronsUpDown size={14} />{preferences.sortMode === "favorite" ? "收藏优先" : preferences.sortMode === "name" ? "按名称" : preferences.sortMode === "recent" ? "最近使用" : "最近添加"}</div>
            </div>
          )}

          {loading ? (
            <div className="vault-loading"><div className="loading-instrument"><span /></div><p>正在解密验证器资料…</p></div>
          ) : view === "trash" ? (
            <div className="trash-view">
              <header><span>{trashEntries.length} 条记录</span>{trashEntries.length > 0 && <button type="button" className="danger-button" onClick={emptyTrash}><Trash2 size={15} />清空回收站</button>}</header>
              {visibleEntries.length ? visibleEntries.map(({ item, record }) => (
                <article className="trash-row" key={item.id}>
                  <span className="issuer-tile" style={{ "--issuer-color": item.color } as React.CSSProperties}>{item.issuer[0]?.toUpperCase()}</span>
                  <span><strong>{item.issuer}</strong><small>{item.accountName || "无账户名"}</small></span>
                  <time>删除于 {new Intl.DateTimeFormat("zh-CN").format(new Date(record.deletedAt!))}</time>
                  <button type="button" className="secondary-button" onClick={() => void restoreItem(item.id)}><ArchiveRestore size={15} />恢复</button>
                  <button type="button" className="icon-button danger-text" onClick={() => permanentDelete(item)} aria-label="永久删除"><Trash2 size={16} /></button>
                </article>
              )) : <EmptyState view={view} search={search} onAdd={() => setEntryDialogOpen(true)} />}
            </div>
          ) : visibleEntries.length ? (
            <div className="otp-list" role="list">
              <div className="otp-list-labels"><span>验证器</span><span>当前验证码</span><span>操作</span></div>
              {visibleEntries.map(({ item }) => (
                <OtpRow
                  key={item.id}
                  item={item}
                  now={now}
                  comfortable={preferences.viewMode === "comfortable"}
                  onOpen={() => setDetailId(item.id)}
                  onCopy={(code) => void copyCode(item, code)}
                  onFavorite={() => void toggleFavorite(item)}
                  onEdit={() => { setEditId(item.id); setEntryDialogOpen(true); }}
                  onDelete={() => void moveToTrash(item)}
                  onNextHotp={() => void nextHotp(item)}
                />
              ))}
            </div>
          ) : (
            <EmptyState view={view} search={search} onAdd={() => setEntryDialogOpen(true)} />
          )}
        </div>
      </section>

      <nav className="mobile-nav" aria-label="移动端导航">
        <button type="button" className={view === "all" ? "active" : ""} onClick={() => setView("all")}><LayoutList size={20} /><span>验证码</span></button>
        <button type="button" className="mobile-add" onClick={() => setEntryDialogOpen(true)}><Plus size={22} /><span>添加</span></button>
        <button type="button" onClick={() => setSettingsOpen(true)}><Settings size={20} /><span>设置</span></button>
      </nav>

      <EntryDialog
        open={entryDialogOpen}
        initial={editing}
        existingItems={activeEntries.map(({ item }) => item)}
        onClose={() => { setEntryDialogOpen(false); setEditId(null); }}
        onSave={saveItem}
      />

      <EntryDetail
        open={Boolean(selected)}
        item={selected?.item || null}
        record={selected?.record || null}
        now={now}
        onClose={() => setDetailId(null)}
        onCopyCode={(code) => selected && void copyCode(selected.item, code)}
        onEdit={() => { if (selected) { setEditId(selected.item.id); setEntryDialogOpen(true); setDetailId(null); } }}
        onFavorite={() => selected && void toggleFavorite(selected.item)}
        onDelete={() => selected && void moveToTrash(selected.item)}
        onNextHotp={() => selected && void nextHotp(selected.item)}
        onSensitiveAction={sensitiveAction}
      />

      <SettingsPanel
        open={settingsOpen}
        vaultKey={vaultKey}
        records={records}
        items={entries.map(({ item }) => item)}
        preferences={preferences}
        onClose={() => setSettingsOpen(false)}
        onPreferencesChange={onPreferencesChange}
        onReload={loadEntries}
        onSensitiveAction={sensitiveAction}
      />

      <ReauthDialog
        open={Boolean(reauthAction)}
        title={reauthAction?.title || "确认主密码"}
        onClose={() => setReauthAction(null)}
        onVerified={async () => { await reauthAction?.action(); }}
      />
    </main>
  );
}

function EmptyState({ view, search, onAdd }: { view: View; search: string; onAdd: () => void }) {
  const isSearch = Boolean(search.trim());
  return (
    <div className="empty-state">
      <div className="empty-dial"><KeyRound size={28} /><span /></div>
      <p className="eyebrow">{isSearch ? "NO MATCH" : view === "trash" ? "QUARANTINE CLEAR" : "READY FOR FIRST ENTRY"}</p>
      <h2>{isSearch ? "没有匹配的验证器。" : view === "trash" ? "回收站是空的。" : "仪器台还没有验证码。"}</h2>
      <p>{isSearch ? "尝试服务名称、账户、分组、标签或备注。" : view === "trash" ? "删除的验证器会暂时停留在这里。" : "扫描二维码、上传图片，或输入 Base32 密钥开始。"}</p>
      {!isSearch && view !== "trash" && <button className="primary-button" type="button" onClick={onAdd}><Sparkles size={17} />添加第一个验证器</button>}
    </div>
  );
}
