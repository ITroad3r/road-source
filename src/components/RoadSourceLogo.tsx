type Props = { className?: string; showWordmark?: boolean };

export function RoadSourceLogo({ className, showWordmark = true }: Props) {
  return (
    <div className={className} style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem" }}>
      <svg viewBox="0 0 120 120" className="h-9 w-9" aria-hidden>
        <path d="M 40 95 C 40 65, 55 50, 60 42" fill="none" stroke="#2563EB" strokeWidth="11" strokeLinecap="round" />
        <path d="M 80 95 C 80 65, 65 50, 60 42" fill="none" stroke="#0D9488" strokeWidth="11" strokeLinecap="round" />
        <circle cx="60" cy="38" r="9" fill="#1E293B" />
        <circle cx="60" cy="38" r="2.6" fill="#FFFFFF" />
        <path d="M 60 24 L 60 12" fill="none" stroke="#2563EB" strokeWidth="8" strokeLinecap="round" />
      </svg>
      {showWordmark && (
        <div className="leading-tight">
          <div className="font-extrabold text-[1.05rem] tracking-tight text-foreground">RoadSource</div>
          <div className="text-[0.6rem] font-semibold tracking-[0.18em] text-muted-foreground">POWERED BY IT ROAD</div>
        </div>
      )}
    </div>
  );
}
