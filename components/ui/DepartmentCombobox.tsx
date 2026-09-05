"use client";

// Department combobox on the 3b `.sp-combobox` / `.sp-listbox` anatomy
// (PHASE3DS §1.17; specimen 03-panels-and-sheets.html line 112): managed
// list + free text. Typing filters the list; an unmatched name shows the
// `.sp-listbox-create` row "Add “X” as a new department" — the name is
// added at save (createEmployee / updateEmployee accept free text), so the
// row only closes the list and keeps the typed value. Keyboard: ↓ ↑ move,
// ↵ picks, Esc closes; blur closes after the click on an option lands.

import { useId, useState, type KeyboardEvent } from "react";
import { ChevronIcon } from "@/components/seat-map/mapIcons";

export type DepartmentChoice = { name: string; count: number };

export function DepartmentCombobox({
  id,
  value,
  onChange,
  options,
  describedBy,
  readOnly = false
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  options: DepartmentChoice[];
  describedBy?: string;
  readOnly?: boolean;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const needle = value.trim().toLocaleLowerCase();
  const matches = options.filter(option => !needle || option.name.toLocaleLowerCase().includes(needle));
  const exact = options.some(option => option.name.toLocaleLowerCase() === needle);
  const showCreate = needle.length > 0 && !exact;
  const rowCount = matches.length + (showCreate ? 1 : 0);
  const clampedIndex = Math.min(activeIndex, Math.max(rowCount - 1, 0));

  function pick(index: number) {
    if (index < matches.length) onChange(matches[index].name);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (readOnly) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(current => Math.min(current + 1, Math.max(rowCount - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(current => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && rowCount > 0) {
      event.preventDefault();
      pick(clampedIndex);
    } else if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
    }
  }

  const activeId = open && rowCount > 0 ? `${listboxId}-${clampedIndex}` : undefined;

  return (
    <div className="sp-combobox" data-open={open || undefined}>
      <input
        id={id}
        name="department"
        className="cds-text-input"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        value={value}
        readOnly={readOnly}
        onChange={event => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => { if (!readOnly) setOpen(true); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKeyDown}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        aria-describedby={describedBy}
      />
      <ChevronIcon />
      {open && rowCount > 0 && (
        <ul id={listboxId} role="listbox" className="sp-listbox" aria-label="Departments">
          {matches.map((option, index) => (
            <li
              key={option.name}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={option.name === value}
              data-state={index === clampedIndex ? "hover" : undefined}
              onMouseDown={event => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => pick(index)}
            >
              {option.name}
              <span className="sp-listbox-meta">{option.count} {option.count === 1 ? "person" : "people"}</span>
            </li>
          ))}
          {showCreate && (
            <li
              id={`${listboxId}-${matches.length}`}
              role="option"
              aria-selected={false}
              className="sp-listbox-create"
              data-state={matches.length === clampedIndex ? "hover" : undefined}
              onMouseDown={event => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(matches.length)}
              onClick={() => pick(matches.length)}
            >
              Add “{value.trim()}” as a new department
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
