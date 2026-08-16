import { ThemeToggle } from "seat-planner";

// ThemeToggle has no props: its checked state mirrors html[data-theme],
// which a preview cell cannot set — so only the light-mode state (moon glyph,
// "Dark mode" affordance) is statically renderable. Both cells sit on the
// reception surface that owns the --r-* tokens it styles with.

export const Control = () => (
  <div className="reception-theme" style={{ display: "inline-block", background: "var(--r-bg)", padding: 24 }}>
    <ThemeToggle />
  </div>
);

export const InReceptionHeader = () => (
  <div className="reception-theme" style={{ width: 460, background: "var(--r-bg)", padding: 16 }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        background: "var(--r-card)",
        border: "1px solid var(--r-card-border)",
        padding: "10px 14px"
      }}
    >
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--r-text)" }}>Reception directory</div>
        <div style={{ fontSize: 11.5, color: "var(--r-muted)" }}>Megeredchian Law · 41 people</div>
      </div>
      <ThemeToggle />
    </div>
  </div>
);
