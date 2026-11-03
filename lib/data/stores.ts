import "server-only";
import { connection } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";

export type Store = {
  id: string;
  name: string;
  address: string;
  hours: string;
  description: string;
};

export async function getStores(): Promise<Store[]> {
  await connection();
  const { data, error } = await createPublicClient()
    .from("stores")
    .select("slug,name,address,hours,description")
    .order("sort_order");
  if (error) throw new Error(`매장 조회 실패: ${error.message}`);
  return data.map((store) => ({
    id: store.slug,
    name: store.name,
    address: store.address ?? "",
    hours: store.hours ?? "",
    description: store.description ?? "",
  }));
}
