"use client";

import { FormEvent, useEffect, useState } from "react";
import { FolderInput, LoaderCircle, Tags } from "lucide-react";
import { Modal } from "@/components/ui/modal";

interface BulkEditDialogProps {
  open: boolean;
  mode: "move" | "tags";
  selectedCount: number;
  groups: string[];
  onClose: () => void;
  onApply: (value: string) => Promise<void>;
}

export function BulkEditDialog({ open, mode, selectedCount, groups, onClose, onApply }: BulkEditDialogProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setValue("");
      setError("");
    }
  }, [open, mode]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode === "tags") {
      const tags = value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
      if (!tags.length) {
        setError("请输入至少一个标签");
        return;
      }
      if (tags.some((tag) => tag.length > 30)) {
        setError("每个标签最多 30 个字符");
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      await onApply(value);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "批量操作失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "move" ? "批量移动分组" : "批量添加标签"}
      eyebrow="BULK ORGANIZATION"
      size="small"
    >
      <form className="bulk-edit-form" onSubmit={submit}>
        <div className="instruction-card">
          {mode === "move" ? <FolderInput size={21} /> : <Tags size={21} />}
          <p>将修改已选择的 {selectedCount} 个验证器。OTP 密钥不会改变。</p>
        </div>
        <label>
          <span className="field-label">{mode === "move" ? "目标分组" : "新增标签"}</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            list={mode === "move" ? "bulk-group-options" : undefined}
            maxLength={mode === "move" ? 60 : 320}
            placeholder={mode === "move" ? "留空表示移到未分组" : "例如：常用, 高风险"}
            autoFocus
          />
          {mode === "move" && <datalist id="bulk-group-options">{groups.map((group) => <option value={group} key={group} />)}</datalist>}
        </label>
        {mode === "tags" && <small className="field-help">使用逗号分隔；会与现有标签合并，每项最多保留 10 个标签。</small>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>取消</button>
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={17} /> : mode === "move" ? <FolderInput size={17} /> : <Tags size={17} />}
            {busy ? "正在批量加密…" : "应用到所选项目"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
