"use server";

import { unstable_rethrow } from "next/navigation";
import { publicCartProducts } from "./data";

export async function loadCartProducts(ids: string[]) {
  try {
    return await publicCartProducts(ids);
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false as const };
  }
}
