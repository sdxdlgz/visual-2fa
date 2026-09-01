"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

interface AuthScreenProps {
  mode: "setup" | "login" | "locked";
  username: string;
  onSubmit: (username: string, password: string) => Promise<void>;
  onLogout?: () => Promise<void>;
}

function getPasswordScore(password: string): number {
  let score = 0;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/[a-zA-Z]/.test(password) && /\d/.test(password)) score += 1;
  if (/[^\p{L}\p{N}]/u.test(password) || password.length >= 20) score += 1;
  return score;
}

export function AuthScreen({ mode, username: suppliedUsername, onSubmit, onLogout }: AuthScreenProps) {
  const [username, setUsername] = useState(suppliedUsername);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (suppliedUsername) setUsername(suppliedUsername);
    else if (mode === "login") setUsername(localStorage.getItem("visual2fa:last-username") || "");
  }, [mode, suppliedUsername]);

  const score = useMemo(() => getPasswordScore(password), [password]);
  const isSetup = mode === "setup";
  const isLocked = mode === "locked";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (isSetup && password !== confirmPassword) {
      setError("两次输入的主密码不一致");
      return;
    }
    if (isSetup && password.length < 12) {
      setError("主密码至少需要 12 个字符");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(username, password);
      setPassword("");
      setConfirmPassword("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法解锁，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-atmosphere" aria-hidden="true">
        <div className="auth-orbit auth-orbit-outer" />
        <div className="auth-orbit auth-orbit-inner" />
        <div className="auth-dial">
          <span className="auth-dial-number">30</span>
          <span className="auth-dial-caption">SECOND CYCLE</span>
        </div>
        <div className="auth-coordinate">31°13′N<br />121°28′E</div>
      </section>

      <section className="auth-panel">
        <BrandMark />
        <div className="auth-copy">
          <p className="eyebrow">{isSetup ? "INITIAL CALIBRATION" : isLocked ? "VAULT SUSPENDED" : "PRIVATE ACCESS"}</p>
          <h1>{isSetup ? "建立你的私人仪器。" : isLocked ? "保险库已锁定。" : "欢迎回来。"}</h1>
          <p>
            {isSetup
              ? "密钥只会以加密形态离开此浏览器；服务端无法读取你的验证码资料。"
              : isLocked
                ? "解密密钥已从当前页面释放。输入主密码，重新校准。"
                : "输入凭据以解锁本机内存中的验证器保险库。"}
          </p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label className="field-label" htmlFor="username">用户名</label>
          <div className="field-control">
            <KeyRound size={18} aria-hidden="true" />
            <input
              id="username"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              minLength={3}
              maxLength={40}
              required
              disabled={isLocked || busy}
              placeholder="vault.owner"
              autoFocus={!isLocked}
            />
          </div>

          <label className="field-label" htmlFor="password">{isSetup ? "创建主密码" : "主密码"}</label>
          <div className="field-control">
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              id="password"
              name="password"
              type={visible ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isSetup ? "new-password" : "current-password"}
              minLength={isSetup ? 12 : 1}
              maxLength={128}
              required
              disabled={busy}
              autoFocus={isLocked}
              placeholder={isSetup ? "至少 12 个字符，建议使用长密码短语" : "输入主密码"}
            />
            <button type="button" className="field-action" onClick={() => setVisible((value) => !value)} aria-label={visible ? "隐藏密码" : "显示密码"}>
              {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {isSetup && (
            <>
              <div className="password-meter" aria-label={`密码强度 ${score} / 4`}>
                {[1, 2, 3, 4].map((value) => <span key={value} className={score >= value ? "active" : ""} />)}
                <small>{score <= 1 ? "需要更长" : score === 2 ? "尚可" : score === 3 ? "稳健" : "强"}</small>
              </div>
              <label className="field-label" htmlFor="confirm-password">确认主密码</label>
              <div className="field-control">
                <ShieldCheck size={18} aria-hidden="true" />
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type={visible ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  disabled={busy}
                  placeholder="再次输入主密码"
                />
              </div>
            </>
          )}

          {error && <div className="form-error" role="alert">{error}</div>}

          <button className="primary-button auth-submit" type="submit" disabled={busy}>
            <span>{busy ? "正在安全处理…" : isSetup ? "创建并进入保险库" : "解锁保险库"}</span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </form>

        {isLocked && onLogout && (
          <button type="button" className="text-button auth-switch" onClick={onLogout}>退出当前会话</button>
        )}

        <footer className="auth-footnote">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>AES-256-GCM · PBKDF2 600K · 零第三方分析脚本</span>
        </footer>
      </section>
    </main>
  );
}
