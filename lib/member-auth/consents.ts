import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const signupConsentVersions = {
  terms: "1.0",
  privacy: "1.0",
} as const;

export async function recordSignupConsent(userId: string) {
  const admin = createAdminClient();
  const { error } = await admin.from("member_consents").insert({
    user_id: userId,
    terms_version: signupConsentVersions.terms,
    privacy_version: signupConsentVersions.privacy,
  });
  if (!error) return;

  const cleanup = await admin.auth.admin.deleteUser(userId);
  if (cleanup.error) {
    throw new AggregateError(
      [error, cleanup.error],
      "member consent insert and signup cleanup failed",
    );
  }
  throw error;
}
