import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { AccountMenu } from "seat-planner";

// The chip lives in AppTopBar's right cluster on the dark chrome strip, so both
// cells reproduce that strip. The menu opens from internal state (no `open`
// prop), so the open cell clicks the trigger once on mount — the same path a
// user takes — rather than faking the panel.

const strip: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  height: 40,
  paddingRight: 4,
  background: "var(--admin-chrome-bg)"
};

export const AdminIdentity = () => (
  <div className="admin-theme" style={{ width: 420 }}>
    <div style={strip}>
      <span style={{ fontSize: 11.5, color: "var(--admin-chrome-muted)", marginRight: 4 }}>Autosaved 2:14 PM</span>
      <AccountMenu email="patrick@megeredchianlaw.com" roleLabel="Admin" />
    </div>
  </div>
);

export const OpenMenu = () => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    hostRef.current?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')?.click();
  }, []);
  return (
    <div
      className="admin-theme"
      ref={hostRef}
      style={{ width: 420, paddingBottom: 160, background: "var(--admin-map-workspace)" }}
    >
      <div style={strip}>
        <span style={{ fontSize: 11.5, color: "var(--admin-chrome-muted)", marginRight: 4 }}>Autosaved 2:14 PM</span>
        <AccountMenu email="patrick@megeredchianlaw.com" roleLabel="Admin" />
      </div>
    </div>
  );
};
