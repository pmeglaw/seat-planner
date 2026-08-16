import { Button } from "seat-planner";

export const Variants = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <Button variant="primary">Publish seat map</Button>
    <Button variant="secondary">Review changes</Button>
    <Button variant="quiet">Cancel</Button>
    <Button variant="destructive">Delete seat</Button>
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Button variant="primary" size="medium">Save assignment</Button>
    <Button variant="primary" size="small">Save</Button>
    <Button variant="secondary" size="small">Undo</Button>
  </div>
);

export const States = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <Button variant="primary" loading>Publishing…</Button>
    <Button variant="primary" disabled>Publish seat map</Button>
    <Button variant="secondary" disabled>Review changes</Button>
  </div>
);
