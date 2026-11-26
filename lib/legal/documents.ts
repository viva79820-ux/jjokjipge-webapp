import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type LegalDocumentName = "terms-of-service" | "privacy-consent-signup";

const legalRoot = join(process.cwd(), "content", "legal");
const documents: Record<LegalDocumentName, string> = {
  "terms-of-service": readFileSync(
    join(legalRoot, "terms-of-service.md"),
    "utf8",
  ),
  "privacy-consent-signup": readFileSync(
    join(legalRoot, "privacy-consent-signup.md"),
    "utf8",
  ),
};

export function readLegalDocument(name: LegalDocumentName) {
  return documents[name];
}
