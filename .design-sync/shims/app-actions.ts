// design-sync shim: @/app/actions ("use server" actions) outside the Next
// runtime. Previews render initial state only; an interaction that invokes a
// server action rejects loudly instead of dragging the Supabase server
// client + AI agent code into the browser bundle.
// Keep in step with `grep -oE "^export (async )?function \w+" app/actions.ts`.
const disabled = (name: string) => async (..._args: unknown[]): Promise<never> => {
  throw new Error(`${name} is a server action — disabled in design previews`);
};

export const askPlannerAction = disabled("askPlannerAction");
export const createDepartmentAction = disabled("createDepartmentAction");
export const createEmployeeAction = disabled("createEmployeeAction");
export const createSeatAction = disabled("createSeatAction");
export const createZoneAction = disabled("createZoneAction");
export const deleteDepartmentAction = disabled("deleteDepartmentAction");
export const deleteEmployeeAction = disabled("deleteEmployeeAction");
export const deleteSeatAction = disabled("deleteSeatAction");
export const deleteZoneAction = disabled("deleteZoneAction");
export const getPublishHistoryAction = disabled("getPublishHistoryAction");
export const importAssignmentsCsvAction = disabled("importAssignmentsCsvAction");
export const publishSeatMapAction = disabled("publishSeatMapAction");
export const renameDepartmentAction = disabled("renameDepartmentAction");
export const renameZoneAction = disabled("renameZoneAction");
export const resetDraftToPublishedAction = disabled("resetDraftToPublishedAction");
export const restoreDraftSnapshotAction = disabled("restoreDraftSnapshotAction");
export const swapSeatAssignmentsAction = disabled("swapSeatAssignmentsAction");
export const updateEmployeeAction = disabled("updateEmployeeAction");
export const updateSeatAction = disabled("updateSeatAction");
