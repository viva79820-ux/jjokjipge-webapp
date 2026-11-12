import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { publicImageUrl } from "@/lib/counselors/rules";
import { createPublicClient } from "@/lib/supabase/public";

export type Counselor = {
  id: string;
  name: string;
  field: "tarot" | "saju";
  fields: ("tarot" | "saju")[];
  tags: string[];
  careers: string[];
  intro: string;
  description: string;
  imagePath: string | null;
  imageUrl: string | null;
  isRecommended: boolean;
  isNew: boolean;
  storeName: string;
  products: { id: string; name: string; minutes: number; price: number }[];
};

type CounselorRow = {
  slug: string;
  name: string;
  field: Counselor["field"];
  fields: Counselor["fields"];
  tags: string[];
  careers: string[];
  intro: string | null;
  description: string | null;
  image_path: string | null;
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
    fields: row.fields,
    tags: row.tags,
    careers: row.careers ?? [],
    intro: row.intro ?? "",
    description: row.description ?? "",
    imagePath: row.image_path,
    imageUrl: publicImageUrl(row.image_path),
    isRecommended: row.is_recommended,
    isNew: row.is_new,
    storeName: row.stores?.name ?? "",
    products: row.consult_products,
  };
}

const columns =
  "slug,name,field,fields,tags,careers,intro,description,image_path,is_recommended,is_new,stores(name),consult_products(id,name,minutes,price)";

function publicCounselors() {
  return createPublicClient()
    .from("counselors")
    .select(columns)
    .eq("is_active", true)
    .eq("approval_status", "approved");
}

export async function getCounselors(): Promise<Counselor[]> {
  await connection();
  const { data, error } = await publicCounselors()
    .order("sort_order")
    .order("sort_order", { referencedTable: "consult_products" });
  if (error) throw new Error(`상담사 조회 실패: ${error.message}`);
  return (data as unknown as CounselorRow[]).map(mapCounselor);
}

export const getCounselor = cache(
  async (slug: string): Promise<Counselor | null> => {
    await connection();
    const { data, error } = await publicCounselors()
      .eq("slug", slug)
      .order("sort_order", { referencedTable: "consult_products" })
      .maybeSingle();
    if (error) throw new Error(`상담사 조회 실패: ${error.message}`);
    return data ? mapCounselor(data as unknown as CounselorRow) : null;
  },
);
