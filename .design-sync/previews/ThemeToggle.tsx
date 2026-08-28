import { ThemeToggle } from "seat-planner";

// ThemeToggle has no props: its checked state mirrors html[data-theme],
// which a preview cell cannot set — so only the light-mode state (moon glyph,
// "Dark mode" affordance) is statically renderable. Both cells sit on the
// reception surface that owns the tokens it styles with. Wrapper chrome
// stays at/above the 12px type floor that now applies off the map canvas.

export const Control = () => (
  <div className="reception-theme" style={{ display: "inline-block", background: "var(--sp-background)", padding: 24 }}>
    <ThemeToggle />
  </div>
);

export const InReceptionHeader = () => (
  <div className="reception-theme" style={{ width: 460, background: "var(--sp-background)", padding: 16 }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        background: "var(--sp-layer-01)",
        border: "1px solid var(--sp-border-subtle)",
        padding: "10px 14px"
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--sp-text-primary)" }}>Reception directory</div>
        <div style={{ fontSize: 12, color: "var(--sp-text-helper)" }}>Megeredchian Law · 41 people</div>
      </div>
      <ThemeToggle />
    </div>
  </div>
);
