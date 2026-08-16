import type { CSSProperties } from "react";
import { AppShell, StatusBadge } from "seat-planner";

// Full chrome composition: AppTopBar + fixed AppRail + a content pane.
// The transformed frame contains the fixed rail; usePathname() is pinned to
// "/" in previews, so the bar shows the map surface (no section title) and
// the admin rail lights "Seat map". Content panes carry their own pl-12 rail
// offset, matching the (shell) page contract. skewDetector stubbed — no
// probe fetches during capture.

const idleSkewDetector = { check: async () => false, isSkewed: () => false };

const frame: CSSProperties = {
  position: "relative",
  transform: "translateZ(0)",
  overflow: "hidden",
  width: "100%",
  height: 560,
  background: "var(--sp-color-canvas, #F7F6F2)"
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  padding: "10px 14px",
  borderTop: "1px solid var(--sp-color-border-subtle, #EDE8E0)",
  fontSize: 13
};

export const AdminMapShell = () => (
  <div style={frame}>
    <AppShell email="patrick@megeredchianlaw.com" isAdmin={true} skewDetector={idleSkewDetector}>
      <div
        className="admin-theme"
        id="planning-canvas"
        style={{ minHeight: 520, background: "var(--admin-map-workspace)", padding: "24px 24px 24px 72px" }}
      >
        <div style={{ width: 460, background: "#fff", border: "1px solid var(--sp-color-border-strong, #BEB4A8)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--sp-color-text-primary, #161616)" }}>Floor 3 — Litigation wing</div>
              <div style={{ fontSize: 12, color: "var(--sp-color-text-muted, #6E655A)" }}>Draft layer · 2 pending moves</div>
            </div>
            <StatusBadge tone="draft">Draft</StatusBadge>
          </div>
          {[
            ["A-12", "Anahit Petrosyan", "Senior Paralegal · Litigation"],
            ["B-03", "Marcus Webb", "Associate Attorney · Litigation"],
            ["C-07", "Vacant", "Reserved for Intake"]
          ].map(([seat, name, role]) => (
            <div key={seat} style={rowStyle}>
              <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12, fontWeight: 600, color: "var(--sp-color-text-secondary, #55504A)" }}>
                {seat}
              </span>
              <span style={{ fontWeight: 600, color: "var(--sp-color-text-primary, #161616)" }}>{name}</span>
              <span style={{ fontSize: 12, color: "var(--sp-color-text-muted, #6E655A)" }}>{role}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  </div>
);

export const ViewerReceptionShell = () => (
  <div style={frame}>
    <AppShell email="anahit.petrosyan@megeredchianlaw.com" isAdmin={false} skewDetector={idleSkewDetector}>
      <div
        className="reception-theme"
        id="reception-main"
        style={{ minHeight: 520, background: "var(--r-bg)", padding: "24px 24px 24px 72px" }}
      >
        <div style={{ width: 480, background: "var(--r-card)", border: "1px solid var(--r-card-border)" }}>
          <div style={{ padding: "12px 14px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--r-text)" }}>Reception — call routing</div>
            <div style={{ fontSize: 12, color: "var(--r-muted)" }}>Published directory · read only</div>
          </div>
          {[
            ["Anahit Petrosyan", "Senior Paralegal · Litigation", "Ext 214"],
            ["Marcus Webb", "Associate Attorney · Litigation", "Ext 231"],
            ["Lusine Grigoryan", "Intake Coordinator · Intake", "Ext 203"]
          ].map(([name, role, ext]) => (
            <div key={name} style={{ ...rowStyle, borderTop: "1px solid var(--r-rule)" }}>
              <span style={{ fontWeight: 600, color: "var(--r-text)" }}>{name}</span>
              <span style={{ fontSize: 12, color: "var(--r-muted)", flex: 1 }}>{role}</span>
              <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11.5, color: "var(--r-ext-label)" }}>{ext}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  </div>
);
