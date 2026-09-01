"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import {
  Camera,
  Check,
  ChevronDown,
  FileImage,
  Keyboard,
  Link2,
  LoaderCircle,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { generateOtp, isValidBase32, normalizeSecret, otpFingerprint, parseOtpAuthUri, type ParsedOtpAuth } from "@/lib/client/otp";
import type { OtpAlgorithm, OtpType, VaultItem } from "@/lib/shared/types";

interface EntryDialogProps {
  open: boolean;
  initial?: VaultItem | null;
  existingItems: VaultItem[];
  onClose: () => void;
  onSave: (item: VaultItem) => Promise<void>;
}

type ImportMethod = "scan" | "uri" | "manual";

interface FormState {
  id: string;
  type: OtpType;
  issuer: string;
  accountName: string;
  secret: string;
  algorithm: OtpAlgorithm;
  digits: number;
  period: number;
  counter: number;
  notes: string;
  group: string;
  tags: string;
  favorite: boolean;
  color: string;
  createdAt: string;
}

const colors = ["#78D5C7", "#5FA8D3", "#D9B26F", "#D4816F", "#9C8BD3", "#82A36F"];

function emptyForm(): FormState {
  return {
    id: crypto.randomUUID(),
    type: "totp",
    issuer: "",
    accountName: "",
    secret: "",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    counter: 0,
    notes: "",
    group: "",
    tags: "",
    favorite: false,
    color: colors[0],
    createdAt: new Date().toISOString(),
  };
}

function fromItem(item: VaultItem): FormState {
  return { ...item, tags: item.tags.join(", ") };
}

function applyParsed(current: FormState, parsed: ParsedOtpAuth): FormState {
  return {
    ...current,
    type: parsed.type,
    issuer: parsed.issuer,
    accountName: parsed.accountName,
    secret: parsed.secret,
    algorithm: parsed.algorithm,
    digits: parsed.digits,
    period: parsed.period,
    counter: parsed.counter,
  };
}

export function EntryDialog({ open, initial, existingItems, onClose, onSave }: EntryDialogProps) {
  const [method, setMethod] = useState<ImportMethod>(initial ? "manual" : "scan");
  const [form, setForm] = useState<FormState>(() => (initial ? fromItem(initial) : emptyForm()));
  const [uri, setUri] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMethod(initial ? "manual" : "scan");
    setForm(initial ? fromItem(initial) : emptyForm());
    setUri("");
    setError("");
    setCameraActive(false);
  }, [initial, open]);

  useEffect(() => {
    if (open) return;
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, [open]);

  const previewItem = useMemo<VaultItem | null>(() => {
    const secret = normalizeSecret(form.secret);
    if (!form.issuer.trim() || !isValidBase32(secret)) return null;
    return {
      id: form.id,
      type: form.type,
      issuer: form.issuer.trim(),
      accountName: form.accountName.trim(),
      secret,
      algorithm: form.algorithm,
      digits: form.digits,
      period: form.period,
      counter: form.counter,
      notes: form.notes,
      group: form.group.trim(),
      tags: form.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 10),
      favorite: form.favorite,
      color: form.color,
      createdAt: form.createdAt,
      updatedAt: new Date().toISOString(),
    };
  }, [form]);

  const previewCode = useMemo(() => {
    try {
      return previewItem ? generateOtp(previewItem) : "— — — — — —";
    } catch {
      return "— — — — — —";
    }
  }, [previewItem]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  };

  const acceptDecoded = (value: string) => {
    try {
      const parsed = parseOtpAuthUri(value);
      setForm((current) => applyParsed(current, parsed));
      setUri(value);
      setMethod("manual");
      setError("");
      setCameraActive(false);
      controlsRef.current?.stop();
      controlsRef.current = null;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "二维码内容无法识别");
    }
  };

  const decodeImage = async (file: File) => {
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
      setError("请选择 10MB 以内的二维码图片");
      return;
    }
    setScanning(true);
    setError("");
    const objectUrl = URL.createObjectURL(file);
    try {
      const reader = new BrowserQRCodeReader();
      const result = await reader.decodeFromImageUrl(objectUrl);
      acceptDecoded(result.getText());
    } catch {
      setError("图片中没有检测到可用的 otpauth 二维码");
    } finally {
      URL.revokeObjectURL(objectUrl);
      setScanning(false);
    }
  };

  const startCamera = async () => {
    setError("");
    setCameraActive(true);
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    if (!videoRef.current) return;
    try {
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        videoRef.current,
        (result) => {
          if (result) acceptDecoded(result.getText());
        },
      );
      controlsRef.current = controls;
    } catch {
      setCameraActive(false);
      setError("无法使用摄像头。请允许权限，或改用二维码图片。");
    }
  };

  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraActive(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!previewItem) {
      setError("请填写服务名称和有效的 Base32 密钥");
      return;
    }
    const duplicate = existingItems.find(
      (item) => item.id !== initial?.id && otpFingerprint(item) === otpFingerprint(previewItem),
    );
    if (duplicate) {
      setError(`检测到重复密钥：${duplicate.issuer}${duplicate.accountName ? ` · ${duplicate.accountName}` : ""}`);
      return;
    }
    setBusy(true);
    try {
      await onSave(previewItem);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法保存验证器");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        stopCamera();
        onClose();
      }}
      title={initial ? "编辑验证器" : "添加验证器"}
      eyebrow={initial ? "CALIBRATE ENTRY" : "NEW INSTRUMENT"}
      size="large"
    >
      {!initial && (
        <nav className="method-tabs" aria-label="导入方式">
          <button type="button" className={method === "scan" ? "active" : ""} onClick={() => setMethod("scan")}>
            <ScanLine size={17} /> 扫描二维码
          </button>
          <button type="button" className={method === "uri" ? "active" : ""} onClick={() => setMethod("uri")}>
            <Link2 size={17} /> 验证器链接
          </button>
          <button type="button" className={method === "manual" ? "active" : ""} onClick={() => setMethod("manual")}>
            <Keyboard size={17} /> 手工输入
          </button>
        </nav>
      )}

      {method === "scan" && !initial && (
        <section className="import-stage">
          {cameraActive ? (
            <div className="camera-stage">
              <video ref={videoRef} muted playsInline aria-label="二维码摄像头画面" />
              <div className="camera-reticle" aria-hidden="true"><span /><span /><span /><span /></div>
              <button className="secondary-button" type="button" onClick={stopCamera}>停止摄像头</button>
            </div>
          ) : (
            <div
              className="qr-dropzone"
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") fileRef.current?.click();
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) void decodeImage(file);
              }}
              onPaste={(event) => {
                const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
                if (file) void decodeImage(file);
              }}
            >
              <div className="dropzone-glyph">
                {scanning ? <LoaderCircle className="spin" size={34} /> : <FileImage size={34} />}
              </div>
              <h3>{scanning ? "正在本地识别…" : "拖入、粘贴或选择二维码图片"}</h3>
              <p>图片只在当前浏览器中解析，不会上传到服务器。</p>
              <span className="secondary-button"><Upload size={16} /> 选择图片</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void decodeImage(file);
                  event.target.value = "";
                }}
              />
            </div>
          )}
          <div className="import-divider"><span>或者</span></div>
          <button type="button" className="camera-button" onClick={startCamera} disabled={cameraActive}>
            <Camera size={22} />
            <span><strong>使用摄像头扫描</strong><small>推荐在手机或带摄像头的设备上使用</small></span>
          </button>
          {error && <div className="form-error" role="alert">{error}</div>}
        </section>
      )}

      {method === "uri" && !initial && (
        <section className="uri-stage">
          <div className="instruction-card">
            <Link2 size={22} />
            <div><strong>粘贴 otpauth:// 链接</strong><p>链接会在浏览器内解析。错误信息不会回显密钥。</p></div>
          </div>
          <label className="field-label" htmlFor="otp-uri">验证器链接</label>
          <textarea
            id="otp-uri"
            className="uri-input"
            value={uri}
            onChange={(event) => setUri(event.target.value)}
            placeholder="otpauth://totp/Service:account?secret=…"
            rows={5}
            autoFocus
          />
          {error && <div className="form-error" role="alert">{error}</div>}
          <button type="button" className="primary-button" onClick={() => acceptDecoded(uri)} disabled={!uri.trim()}>
            解析并预览 <Check size={17} />
          </button>
        </section>
      )}

      {method === "manual" && (
        <form className="entry-form" onSubmit={submit}>
          {!initial && uri && (
            <div className="parse-success"><ShieldCheck size={18} /><span>已在本地解析二维码 / 链接，请核对后保存。</span></div>
          )}

          <div className="entry-preview">
            <span className="issuer-tile" style={{ "--issuer-color": form.color } as React.CSSProperties}>
              {(form.issuer.trim()[0] || "?").toUpperCase()}
            </span>
            <div>
              <span className="entry-preview-label">LIVE PREVIEW</span>
              <strong>{form.issuer || "未命名服务"}</strong>
              <small>{form.accountName || "账户名称"}</small>
            </div>
            <code>{previewCode.replace(/(.{3})(?=.)/, "$1 ")}</code>
          </div>

          <div className="segmented-control" aria-label="验证码类型">
            <button type="button" className={form.type === "totp" ? "active" : ""} onClick={() => update("type", "totp")}>TOTP · 定时</button>
            <button type="button" className={form.type === "hotp" ? "active" : ""} onClick={() => update("type", "hotp")}>HOTP · 计数</button>
          </div>

          <div className="form-grid">
            <label>
              <span className="field-label">服务名称 *</span>
              <input value={form.issuer} onChange={(event) => update("issuer", event.target.value)} maxLength={80} required placeholder="例如 GitHub" />
            </label>
            <label>
              <span className="field-label">账户名称</span>
              <input value={form.accountName} onChange={(event) => update("accountName", event.target.value)} maxLength={120} placeholder="name@example.com" />
            </label>
          </div>

          <label>
            <span className="field-label">Base32 密钥 *</span>
            <input
              className="secret-input"
              value={form.secret}
              onChange={(event) => update("secret", event.target.value.toUpperCase())}
              maxLength={300}
              required
              autoComplete="off"
              spellCheck={false}
              placeholder="JBSW Y3DP EHPK 3PXP"
            />
            <small className="field-help">空格和连字符会自动移除。密钥会先加密，再持久化。</small>
          </label>

          <div className="form-grid">
            <label>
              <span className="field-label">分组</span>
              <input value={form.group} onChange={(event) => update("group", event.target.value)} maxLength={60} placeholder="个人 / 工作 / 金融" />
            </label>
            <label>
              <span className="field-label">标签</span>
              <input value={form.tags} onChange={(event) => update("tags", event.target.value)} maxLength={320} placeholder="常用, 高风险" />
            </label>
          </div>

          <label>
            <span className="field-label">备注</span>
            <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} maxLength={2000} rows={3} placeholder="用途、登录入口或迁移提示（请勿存放密码）" />
          </label>

          <div className="color-favorite-row">
            <fieldset className="color-picker">
              <legend className="field-label">铭牌颜色</legend>
              {colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={form.color === color ? "active" : ""}
                  style={{ backgroundColor: color }}
                  onClick={() => update("color", color)}
                  aria-label={`选择颜色 ${color}`}
                >{form.color === color && <Check size={13} />}</button>
              ))}
            </fieldset>
            <label className="check-label">
              <input type="checkbox" checked={form.favorite} onChange={(event) => update("favorite", event.target.checked)} />
              <span><Sparkles size={16} /> 加入收藏</span>
            </label>
          </div>

          <details className="advanced-fields">
            <summary><ChevronDown size={16} /> 高级 OTP 参数</summary>
            <div className="form-grid form-grid-three">
              <label>
                <span className="field-label">算法</span>
                <select value={form.algorithm} onChange={(event) => update("algorithm", event.target.value as OtpAlgorithm)}>
                  <option value="SHA1">SHA-1</option>
                  <option value="SHA256">SHA-256</option>
                  <option value="SHA512">SHA-512</option>
                </select>
              </label>
              <label>
                <span className="field-label">位数</span>
                <select value={form.digits} onChange={(event) => update("digits", Number(event.target.value))}>
                  <option value={6}>6 位</option><option value={7}>7 位</option><option value={8}>8 位</option>
                </select>
              </label>
              {form.type === "totp" ? (
                <label>
                  <span className="field-label">周期（秒）</span>
                  <input type="number" min={15} max={120} value={form.period} onChange={(event) => update("period", Number(event.target.value))} />
                </label>
              ) : (
                <label>
                  <span className="field-label">计数器</span>
                  <input type="number" min={0} value={form.counter} onChange={(event) => update("counter", Number(event.target.value))} />
                </label>
              )}
            </div>
          </details>

          {error && <div className="form-error" role="alert">{error}</div>}
          <footer className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>取消</button>
            <button type="submit" className="primary-button" disabled={busy || !previewItem}>
              {busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}
              {busy ? "正在加密保存…" : initial ? "保存更改" : "加密并添加"}
            </button>
          </footer>
        </form>
      )}
    </Modal>
  );
}
