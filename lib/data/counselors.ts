import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";

export type Counselor = {
  id: string;
  name: string;
  field: "tarot" | "saju";
  tags: string[];
  intro: string;
  description: string;
  isRecommended: boolean;
  isNew: boolean;
  storeName: string;
  products: { id: string; name: string; minutes: number; price: number }[];
};

type CounselorRow = {
  slug: string;
  name: string;
  field: Counselor["field"];
  tags: string[];
  intro: string | null;
  description: string | null;
  is_recommended: boolean;
  is_new: boolean;
  stores: { name: string } | null;
  consult_products: Counselor["products"];
};

function mapCounselor(row: CounselorRow): Counselor {
  return {
    id: row.slug,
    name: row.name,
    field: row.field,
    tags: row.tags,
    intro: row.intro ?? "",
    description: row.description ?? "",
    isRecommended: row.is_recommended,
    isNew: row.is_new,
    storeName: row.stores?.name ?? "",
    products: row.consult_products,
  };
}

const columns =
  "slug,name,field,tags,intro,description,is_recommended,is_new,stores(name),consult_products(id,name,minutes,price)";

export async function getCounselors(): Promise<Counselor[]> {
  await connection();
  const { data, error } = await createPublicClient()
    .from("counselors")
    .select(columns)
    .order("sort_order")
    .order("sort_order", { referencedTable: "consult_products" });
  if (error) throw new Error(`상담사 조회 실패: ${error.message}`);
  return (data as unknown as CounselorRow[]).map(mapCounselor);
}

export const getCounselor = cache(
  async (slug: string): Promise<Counselor | null> => {
    await connection();
    const { data, error } = await createPublicClient()
      .from("counselors")
      .select(columns)
      .eq("slug", slug)
      .order("sort_order", { referencedTable: "consult_products" })
      .maybeSingle();
    if (error) throw new Error(`상담사 조회 실패: ${error.message}`);
    return data ? mapCounselor(data as unknown as CounselorRow) : null;
  },
);
