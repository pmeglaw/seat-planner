import type { ReactNode } from "react";
import { ManagementDensityProvider } from "@/components/admin-management/ManagementDensity";

export default function ManagementLayout({ children }: { children: ReactNode }) {
  return <ManagementDensityProvider>{children}</ManagementDensityProvider>;
}
