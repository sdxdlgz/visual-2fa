"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { FolderCog, LoaderCircle, Merge } from "lucide-react";
import { Modal } from "@/components/ui/modal";

interface GroupManagerDialogProps {
  open: boolean;
  groups: Array<[string, number]>;
  onClose: () => void;
  onApply: (source: string, target: string) => Promise<void>;
}

export function GroupManagerDialog({ open, groups, onClose, onApply }: GroupManagerDialogProps) {
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSource(groups[0]?.[0] || "");
    setTarget("");
    setError("");
  }, [groups, open]);

  const targetExists = useMemo(() => groups.some(([group]) => group === target.trim()), [groups, target]);
  const sourceCount = groups.find(([group]) => group === source)?.[1] || 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = target.trim();
    if (!source || !normalized) {
      setError("请选择原分组并输入目标分组");
      return;
    }
    if (source === normalized) {
      setError("目标分组不能与原分组相同");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onApply(source, normalized);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法更新分组");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="重命名或合并分组" eyebrow="GROUP CONTROL" size="small">
      <form className="bulk-edit-form" onSubmit={submit}>
        <div className="instruction-card">
          {targetExists ? <Merge size={21} /> : <FolderCog size={21} />}
          <p>{targetExists ? "目标分组已存在，原分组中的项目会合并进去。" : "输入新名称即可重命名整个分组。"}</p>
        </div>
        <label>
          <span className="field-label">原分组</span>
          <select value={source} onChange={(event) => setSource(event.target.value)} required>
            {groups.map(([group, count]) => <option value={group} key={group}>{group}（{count}）</option>)}
          </select>
        </label>
        <label>
          <span className="field-label">目标分组</span>
          <input value={target} onChange={(event) => setTarget(event.target.value)} maxLength={60} list="group-manager-options" placeholder="新名称或已有分组" required />
          <datalist id="group-manager-options">{groups.filter(([group]) => group !== source).map(([group]) => <option value={group} key={group} />)}</datalist>
        </label>
        <div className="group-operation-preview"><strong>{sourceCount}</strong><span>个验证器将移至</span><strong>{target.trim() || "目标分组"}</strong></div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>取消</button>
          <button type="submit" className="primary-button" disabled={busy || !groups.length}>
            {busy ? <LoaderCircle className="spin" size={17} /> : targetExists ? <Merge size={17} /> : <FolderCog size={17} />}
            {busy ? "正在重新加密…" : targetExists ? "合并分组" : "重命名分组"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
