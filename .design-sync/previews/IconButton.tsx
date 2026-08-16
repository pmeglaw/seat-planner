import { CloseIcon, IconButton } from "seat-planner";

const PlusIcon = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M10 4v12M4 10h12" />
  </svg>
);

const TrashIcon = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6h12M8 6V4.5h4V6M6.5 6l.6 9.5h5.8L13.5 6M8.6 8.5v4.5M11.4 8.5v4.5" />
  </svg>
);

const UndoIcon = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 5 4.5 8.5 8 12" />
    <path d="M4.5 8.5H12a3.5 3.5 0 0 1 0 7H9" />
  </svg>
);

export const Variants = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <IconButton variant="neutral" icon={<CloseIcon />} label="Close seat inspector" />
    <IconButton variant="neutral" icon={<UndoIcon />} label="Undo last move" />
    <IconButton variant="primary" icon={<PlusIcon />} label="Add custom seat" />
    <IconButton variant="destructive" icon={<TrashIcon />} label="Delete seat B-03" />
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <IconButton size="medium" variant="neutral" icon={<UndoIcon />} label="Undo last move" />
    <IconButton size="small" variant="neutral" icon={<UndoIcon />} label="Undo last move" />
    <IconButton size="small" variant="primary" icon={<PlusIcon />} label="Add custom seat" />
  </div>
);

export const LoadingAndDisabled = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <IconButton variant="primary" loading icon={<PlusIcon />} label="Adding seat A-12" />
    <IconButton variant="neutral" disabled icon={<UndoIcon />} label="Nothing to undo" />
    <IconButton variant="destructive" disabled icon={<TrashIcon />} label="Original seats are protected" />
  </div>
);
