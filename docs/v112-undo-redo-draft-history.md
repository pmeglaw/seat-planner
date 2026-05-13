# v1.1.2 Undo / Redo Draft History

## Summary

This patch adds a small undo/redo workflow for admin draft edits. History is scoped to draft map work only and is cleared after a successful publish.

## Included Actions

- Seat assignment changes from the inspector
- Vacating a seat
- Employee/status/notes edits saved through the inspector
- Moving a selected seat marker
- Adding a custom seat
- Deleting a custom seat
- CSV assignment imports

## Safety Rules

- Undo/redo restores `public.seats` rows where `layer = 'draft'`.
- Published rows are not touched by undo/redo.
- Successful `Publish Draft Map` clears both undo and redo stacks.
- Undo/redo is disabled while the inspector has unsaved local edits.
- Restore preflights duplicate draft labels and refuses snapshots missing protected original seats.
- Custom seats deleted after the snapshot are restored; custom seats added after the snapshot are removed.
- Referenced employee metadata is restored where practical, but history is not a replacement for employee management.

## Supabase

No new migration is required.

## QA

1. Assign an employee to a draft seat, then Undo and Redo.
2. Vacate a draft seat, then Undo and Redo.
3. Edit status/notes for an unassigned seat, then Undo and Redo.
4. Move a selected seat, then Undo and Redo.
5. Add a custom seat, then Undo and Redo.
6. Delete a custom seat, then Undo and Redo.
7. Import a CSV assignment file, then Undo and Redo.
8. Publish the draft map and confirm Undo/Redo both become disabled.
9. Confirm `/` still shows the last published map and is not changed by Undo/Redo until the next publish.
