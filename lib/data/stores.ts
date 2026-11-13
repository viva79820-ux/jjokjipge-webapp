import "server-only";
import { connection } from "next/server";
import { publicImageUrl } from "@/lib/stores/rules";
import { createPublicClient } from "@/lib/supabase/public";

export type Store = {
  id: string;
  name: string;
  address: string;
  hours: string;
  description: string;
  phone: string;
  imageUrl: string | null;
};

export async function getStores(): Promise<Store[]> {
  await connection();
  const { data, error } = await createPublicClient()
    .from("stores")
    .select("slug,name,address,hours,description,phone,image_path")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(`매장 조회 실패: ${error.message}`);
  return data.map((store) => ({
    id: store.slug,
    name: store.name,
    address: store.address ?? "",
    hours: store.hours ?? "",
    description: store.description ?? "",
    phone: store.phone ?? "",
    imageUrl: publicImageUrl(store.image_path),
  }));
}
