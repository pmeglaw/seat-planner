import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { ManagementDensityProvider } from "@/components/admin-management/ManagementDensity";

export default async function ManagementLayout({ children }: { children: ReactNode }) {
  const preference = (await cookies()).get("sp-management-density")?.value;
  return <ManagementDensityProvider initialDensity={preference === "compact" ? "compact" : "normal"}>{children}</ManagementDensityProvider>;
}
