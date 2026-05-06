import type { Profile } from "@/lib/types";

export function isAdmin(profile: Pick<Profile, "role"> | null | undefined): boolean {
  return profile?.role === "admin";
}

export function assertAdmin(profile: Pick<Profile, "role"> | null | undefined) {
  if (!isAdmin(profile)) {
    throw new Error("Admin permission required.");
  }
}
