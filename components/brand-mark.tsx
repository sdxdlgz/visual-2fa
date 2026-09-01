import clsx from "clsx";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={clsx("brand-lockup", compact && "brand-lockup-compact")} aria-label="Visual 2FA">
      <span className="brand-symbol" aria-hidden="true">
        <span className="brand-symbol-hand" />
        <strong>2</strong>
      </span>
      {!compact && (
        <span className="brand-words">
          <strong>VISUAL</strong>
          <span>PRIVATE AUTHENTICATOR</span>
        </span>
      )}
    </div>
  );
}
