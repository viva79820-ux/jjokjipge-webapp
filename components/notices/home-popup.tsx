import { Suspense } from "react";
import { loadHomePopup } from "@/lib/notices/data";
import { PopupGuard } from "./popup-guard";
import { NoticePopupDialog } from "./popup-dialog";
export function HomeNoticePopup() {
  return (
    <PopupGuard>
      <Suspense fallback={null}>
        <HomeNoticePopupContent />
      </Suspense>
    </PopupGuard>
  );
}
async function HomeNoticePopupContent() {
  return <NoticePopupDialog notice={await loadHomePopup()} />;
}
