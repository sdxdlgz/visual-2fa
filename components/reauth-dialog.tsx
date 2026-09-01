"use client";

import { FormEvent, useEffect, useState } from "react";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { apiFetch } from "@/lib/client/api";

interface ReauthDialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  onVerified: () => Promise<void> | void;
}

export function ReauthDialog({ open, title, description, onClose, onVerified }: ReauthDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPassword("");
      setError("");
    }
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/auth/reauth", { method: "POST", body: JSON.stringify({ password }) });
      await onVerified();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法确认主密码");
    } finally {
      setBusy(false);
      setPassword("");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} eyebrow="REAUTHENTICATION" size="small">
      <form className="reauth-form" onSubmit={submit}>
        <div className="instruction-card warning-card">
          <ShieldCheck size={21} />
          <p>{description || "这是敏感操作。请再次输入主密码，以确认是你本人。"}</p>
        </div>
        <label className="field-label" htmlFor="reauth-password">主密码</label>
        <div className="field-control">
          <KeyRound size={18} />
          <input
            id="reauth-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            maxLength={128}
            required
            autoFocus
          />
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>取消</button>
          <button type="submit" className="primary-button" disabled={busy || !password}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}
            {busy ? "正在确认…" : "确认并继续"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
