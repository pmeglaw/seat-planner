import type { CSSProperties } from "react";
import { AccountMenu } from "seat-planner";

// Closed identity chip only: the menu opens from internal state on click, so
// the expanded menu is not statically renderable. Chips sit on the dark
// chrome strip they live on in AppTopBar's right cluster.

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

export const TeamInitials = () => (
  <div className="admin-theme" style={{ width: 420 }}>
    <div style={{ ...strip, justifyContent: "center", gap: 4 }}>
      <AccountMenu email="patrick@megeredchianlaw.com" roleLabel="Admin" />
      <AccountMenu email="anahit.petrosyan@megeredchianlaw.com" roleLabel="Viewer" />
      <AccountMenu email="marcus.webb@megeredchianlaw.com" roleLabel="Viewer" />
    </div>
  </div>
);
