import { StatusBadge } from "seat-planner";

const DotIcon = () => (
  <svg aria-hidden="true" width="8" height="8" viewBox="0 0 8 8">
    <circle cx="4" cy="4" r="3" fill="currentColor" />
  </svg>
);

const PencilIcon = () => (
  <svg aria-hidden="true" width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m4 16 .8-3.2L13.6 4l2.4 2.4-8.8 8.8L4 16Z" />
  </svg>
);

export const MapLifecycle = () => (
  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
    <StatusBadge tone="published">Published</StatusBadge>
    <StatusBadge tone="draft">Draft</StatusBadge>
    <StatusBadge tone="pending">Pending publish</StatusBadge>
    <StatusBadge tone="readonly">Read only</StatusBadge>
    <StatusBadge tone="neutral">Floor 3</StatusBadge>
  </div>
);

export const FeedbackTones = () => (
  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
    <StatusBadge tone="success">Import complete</StatusBadge>
    <StatusBadge tone="info">14 assignments queued</StatusBadge>
    <StatusBadge tone="warning">2 seats unmapped</StatusBadge>
    <StatusBadge tone="danger">CSV rejected</StatusBadge>
    <StatusBadge tone="blocked">Seat A-12 protected</StatusBadge>
  </div>
);

export const WithIcons = () => (
  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
    <StatusBadge tone="draft" icon={<PencilIcon />}>6 seats modified</StatusBadge>
    <StatusBadge tone="published" icon={<DotIcon />}>Live since 2:14 PM</StatusBadge>
    <StatusBadge tone="warning" icon={<DotIcon />}>Litigation over capacity</StatusBadge>
  </div>
);
