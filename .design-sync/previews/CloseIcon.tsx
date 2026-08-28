import { CloseIcon, IconButton } from "seat-planner";

// The one close glyph: strokes follow currentColor, size rides the className
// (default h-4 w-4). Scale row uses utility sizes that exist in the app CSS.
export const GlyphScale = () => (
  <div style={{ display: "flex", gap: 24, alignItems: "flex-end", color: "var(--sp-text-primary, #161616)" }}>
    {([
      ["h-3 w-3", "12px"],
      ["h-4 w-4", "16px — default"],
      ["h-5 w-5", "20px"]
    ] as const).map(([cls, note]) => (
      <div key={cls} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <CloseIcon className={cls} />
        <span style={{ fontSize: 12, color: "var(--sp-text-helper, #6E655A)" }}>{note}</span>
      </div>
    ))}
  </div>
);

export const InDialogHeader = () => (
  <div
    style={{
      width: 360,
      background: "var(--sp-layer-02, #fff)",
      border: "1px solid var(--sp-border-strong, #BEB4A8)"
    }}
  >
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 12px 12px 16px" }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--sp-text-primary, #161616)" }}>Seat A-12 — Anahit Petrosyan</div>
        <div style={{ fontSize: 12, color: "var(--sp-text-helper, #6E655A)" }}>Senior Paralegal · Litigation</div>
      </div>
      <IconButton size="small" variant="neutral" icon={<CloseIcon />} label="Close seat inspector" />
    </div>
  </div>
);

export const OnDarkChrome = () => (
  <div
    className="admin-theme sp-zone-chrome"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      width: 320,
      padding: "10px 14px",
      background: "var(--sp-background)",
      color: "var(--sp-text-primary)"
    }}
  >
    <span style={{ fontSize: 12.5, fontWeight: 600 }}>Ask Planner</span>
    <span style={{ display: "inline-flex", color: "var(--sp-text-helper)" }}>
      <CloseIcon />
    </span>
  </div>
);
