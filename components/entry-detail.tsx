"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  QrCode,
  RotateCw,
  ShieldAlert,
  Star,
  Trash2,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { generateOtp, otpTimeRemaining, toOtpAuthUri } from "@/lib/client/otp";
import type { EncryptedItemRecord, VaultItem } from "@/lib/shared/types";

interface EntryDetailProps {
  open: boolean;
  item: VaultItem | null;
  record: EncryptedItemRecord | null;
  now: number;
  onClose: () => void;
  onCopyCode: (code: string) => void;
  onEdit: () => void;
  onFavorite: () => void;
  onDelete: () => void;
  onNextHotp: () => void;
  onSensitiveAction: (title: string, action: () => Promise<void> | void) => void;
}

function formatDate(value: string | null): string {
  if (!value) return "从未";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function EntryDetail({
  open,
  item,
  record,
  now,
  onClose,
  onCopyCode,
  onEdit,
  onFavorite,
  onDelete,
  onNextHotp,
  onSensitiveAction,
}: EntryDetailProps) {
  const [secretVisible, setSecretVisible] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSecretVisible(false);
      setQrData(null);
    }
  }, [open]);

  useEffect(() => {
    if (!secretVisible) return;
    const timer = window.setTimeout(() => setSecretVisible(false), 30_000);
    const hide = () => {
      if (document.visibilityState === "hidden") setSecretVisible(false);
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [secretVisible]);

  const code = useMemo(() => (item ? generateOtp(item, now) : ""), [item, now]);
  if (!item || !record) return null;
  const remaining = item.type === "totp" ? otpTimeRemaining(item.period, now) : null;

  const revealSecret = () => {
    onSensitiveAction("显示验证器密钥", () => {
      setSecretVisible(true);
      setQrData(null);
    });
  };

  const revealQr = () => {
    onSensitiveAction("显示迁移二维码", async () => {
      const data = await QRCode.toDataURL(toOtpAuthUri(item), {
        width: 320,
        margin: 2,
        color: { dark: "#0b1214", light: "#f0f2e9" },
        errorCorrectionLevel: "M",
      });
      setQrData(data);
      setSecretVisible(false);
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={item.issuer} eyebrow="INSTRUMENT DETAIL" size="drawer">
      <div className="detail-sheet">
        <section className="detail-code-stage">
          <span className="issuer-tile issuer-tile-large" style={{ "--issuer-color": item.color } as React.CSSProperties}>
            {item.issuer[0]?.toUpperCase() || "?"}
          </span>
          <p>{item.accountName || "未设置账户名"}</p>
          <button className="detail-code" type="button" onClick={() => onCopyCode(code)} aria-label={`复制验证码 ${code.split("").join(" ")}`}>
            <code>{code.replace(/(.{3,4})(?=.)/, "$1 ")}</code>
            <Copy size={18} />
          </button>
          <div className="detail-cycle">
            <span>{item.type === "totp" ? `${remaining} 秒后刷新` : `HOTP 计数器 ${item.counter}`}</span>
            {item.type === "hotp" && <button type="button" className="text-button" onClick={onNextHotp}><RotateCw size={14} /> 生成下一组</button>}
          </div>
        </section>

        <section className="detail-actions">
          <button type="button" onClick={onFavorite}><Star size={17} fill={item.favorite ? "currentColor" : "none"} />{item.favorite ? "取消收藏" : "收藏"}</button>
          <button type="button" onClick={onEdit}><Pencil size={17} />编辑</button>
          <button type="button" onClick={revealQr}><QrCode size={17} />迁移二维码</button>
          <button type="button" className="danger-text" onClick={onDelete}><Trash2 size={17} />删除</button>
        </section>

        {(qrData || secretVisible) && (
          <section className="sensitive-reveal">
            <header><ShieldAlert size={17} /><strong>敏感信息 · 将在离开页面后隐藏</strong></header>
            {qrData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrData} alt={`${item.issuer} 的验证器迁移二维码`} />
            ) : (
              <div className="secret-reveal-value">
                <code>{item.secret.match(/.{1,4}/g)?.join(" ")}</code>
                <button className="icon-button" type="button" onClick={() => navigator.clipboard.writeText(item.secret)} aria-label="复制密钥"><Copy size={16} /></button>
              </div>
            )}
            <button type="button" className="text-button" onClick={() => { setQrData(null); setSecretVisible(false); }}><EyeOff size={14} />立即隐藏</button>
          </section>
        )}

        <section className="detail-section">
          <h3>整理信息</h3>
          <dl className="detail-list">
            <div><dt>分组</dt><dd>{item.group || "未分组"}</dd></div>
            <div><dt>标签</dt><dd>{item.tags.length ? item.tags.map((tag) => <span className="tag" key={tag}>#{tag}</span>) : "无"}</dd></div>
            <div className="detail-notes"><dt>备注</dt><dd>{item.notes || "没有备注"}</dd></div>
          </dl>
        </section>

        <section className="detail-section">
          <h3>OTP 参数</h3>
          <dl className="detail-list">
            <div><dt>类型</dt><dd>{item.type.toUpperCase()}</dd></div>
            <div><dt>算法</dt><dd>{item.algorithm}</dd></div>
            <div><dt>位数</dt><dd>{item.digits} 位</dd></div>
            <div><dt>{item.type === "totp" ? "周期" : "计数器"}</dt><dd>{item.type === "totp" ? `${item.period} 秒` : item.counter}</dd></div>
            <div>
              <dt>Base32 密钥</dt>
              <dd><button className="text-button" type="button" onClick={secretVisible ? () => setSecretVisible(false) : revealSecret}>{secretVisible ? <EyeOff size={14} /> : <Eye size={14} />}{secretVisible ? "隐藏" : "重新验证后显示"}</button></dd>
            </div>
          </dl>
        </section>

        <section className="detail-section detail-meta">
          <h3>记录</h3>
          <dl className="detail-list">
            <div><dt>创建</dt><dd>{formatDate(record.createdAt)}</dd></div>
            <div><dt>更新</dt><dd>{formatDate(record.updatedAt)}</dd></div>
            <div><dt>最近使用</dt><dd>{formatDate(record.lastUsedAt)}</dd></div>
          </dl>
        </section>

        <div className="detail-security-note"><KeyRound size={16} /> 密钥和以上资料均位于 AES-GCM 密文中。</div>
      </div>
    </Modal>
  );
}
