import type { Employee } from "@/lib/types";

// The employee panel's form state, shared by the host (AdminManagementPanel)
// and the panel. Kept as a plain module so both can import the type and the
// two mappers without a circular component import.

export type EmployeeForm = {
  fullName: string;
  position: string;
  department: string;
  phoneExtension: string;
  email: string;
};

export const emptyEmployeeForm: EmployeeForm = {
  fullName: "",
  position: "",
  department: "",
  phoneExtension: "",
  email: ""
};

export function formFromEmployee(employee: Employee): EmployeeForm {
  return {
    fullName: employee.full_name,
    position: employee.position ?? "",
    department: employee.department ?? "",
    phoneExtension: employee.phone_extension ?? "",
    email: employee.email ?? ""
  };
}

/** Dirty = any field differs from the form the panel opened with. */
export function isFormDirty(current: EmployeeForm, initial: EmployeeForm): boolean {
  return (Object.keys(initial) as Array<keyof EmployeeForm>).some(key => current[key] !== initial[key]);
}
