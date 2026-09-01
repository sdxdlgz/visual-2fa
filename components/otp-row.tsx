"use client";

import { Copy, MoreHorizontal, Pencil, RotateCw, Star, Trash2 } from "lucide-react";
import clsx from "clsx";
import { generateOtp, otpTimeRemaining } from "@/lib/client/otp";
import type { VaultItem } from "@/lib/shared/types";

interface OtpRowProps {
  item: VaultItem;
  now: number;
  comfortable: boolean;
  onOpen: () => void;
  onCopy: (code: string) => void;
  onFavorite: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onNextHotp: () => void;
}

function spacedCode(code: string): string {
  const pivot = code.length <= 6 ? 3 : Math.ceil(code.length / 2);
  return `${code.slice(0, pivot)} ${code.slice(pivot)}`;
}

export function OtpRow({ item, now, comfortable, onOpen, onCopy, onFavorite, onEdit, onDelete, onNextHotp }: OtpRowProps) {
  const code = generateOtp(item, now);
  const remaining = item.type === "totp" ? otpTimeRemaining(item.period, now) : null;
  const progress = remaining === null ? 100 : (remaining / item.period) * 100;
  const expiring = remaining !== null && remaining <= 5;

  return (
    <article className={clsx("otp-row", comfortable && "otp-row-comfortable", expiring && "otp-row-expiring")}>
      <button className="otp-identity" type="button" onClick={onOpen} aria-label={`查看 ${item.issuer} ${item.accountName}`}>
        <span className="issuer-tile" style={{ "--issuer-color": item.color } as React.CSSProperties} aria-hidden="true">
          {item.issuer[0]?.toUpperCase() || "?"}
        </span>
        <span className="otp-identity-copy">
          <strong>{item.issuer}</strong>
          <small>{item.accountName || (item.type === "totp" ? "定时验证码" : `计数器 ${item.counter}`)}</small>
          {comfortable && (
            <span className="otp-tags">
              {item.group && <em>{item.group}</em>}
              {item.tags.slice(0, 2).map((tag) => <em key={tag}>#{tag}</em>)}
            </span>
          )}
        </span>
      </button>

      <button
        className="otp-code-button"
        type="button"
        onClick={() => onCopy(code)}
        aria-label={`复制 ${item.issuer} 的验证码 ${code.split("").join(" ")}`}
      >
        <code>{spacedCode(code)}</code>
        <span>{expiring ? "即将刷新" : item.type === "totp" ? `${remaining} 秒` : `HOTP · ${item.counter}`}</span>
        <Copy size={15} aria-hidden="true" />
        <i className="otp-progress" style={{ "--otp-progress": `${progress}%` } as React.CSSProperties} aria-hidden="true" />
      </button>

      {item.type === "hotp" && (
        <button className="icon-button row-action hotp-next" type="button" onClick={onNextHotp} aria-label="生成下一个 HOTP 验证码">
          <RotateCw size={17} />
        </button>
      )}

      <button className={clsx("icon-button row-action", item.favorite && "active")} type="button" onClick={onFavorite} aria-label={item.favorite ? "取消收藏" : "加入收藏"}>
        <Star size={18} fill={item.favorite ? "currentColor" : "none"} />
      </button>

      <details className="row-menu">
        <summary className="icon-button" aria-label="更多操作"><MoreHorizontal size={19} /></summary>
        <div className="row-menu-popover">
          <button type="button" onClick={onOpen}>查看详情</button>
          <button type="button" onClick={onEdit}><Pencil size={15} /> 编辑</button>
          <button type="button" className="danger-text" onClick={onDelete}><Trash2 size={15} /> 移入回收站</button>
        </div>
      </details>
    </article>
  );
}
