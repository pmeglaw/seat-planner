import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SeatMap } from "@/components/seat-map/SeatMap";
import { createClient } from "@/lib/supabase/server";
import type { Employee, SeatWithEmployee } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  await connection();
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <section className="max-w-md rounded-2xl bg-white p-6 shadow-soft">
          <h1 className="text-lg font-bold text-slate-900">Admin access required</h1>
          <p className="mt-2 text-sm text-slate-600">
            You are signed in, but your profile does not have admin permissions.
          </p>
        </section>
      </main>
    );
  }

  const { data: seats, error: seatsError } = await supabase
    .from("seats")
    .select("*, employee:employees(*)")
    .eq("layer", "draft")
    .order("label");

  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select("*")
    .eq("active", true)
    .order("full_name");

  if (seatsError || employeesError) {
    throw new Error(seatsError?.message ?? employeesError?.message);
  }

  return (
    <SeatMap
      seats={(seats ?? []) as SeatWithEmployee[]}
      employees={(employees ?? []) as Employee[]}
      canEdit
    />
  );
}
