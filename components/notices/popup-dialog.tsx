"use client";
import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { publicImageUrl, type NoticePopup } from "@/lib/notices/rules";
import {
  popupDismissed,
  popupTodayKey,
  rememberSession,
  rememberToday,
  summarizeNoticeBody,
} from "@/lib/notices/popup";
function store(kind: "sessionStorage" | "localStorage") {
  try {
    return window[kind];
  } catch {
    return null;
  }
}
function subscribePopupStorage(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === popupTodayKey) notify();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
function popupStorageSnapshot(id: string | null) {
  if (!id) return "empty";
  return popupDismissed(store("sessionStorage"), store("localStorage"), id)
    ? "hidden"
    : "visible";
}
export function NoticePopupDialog({ notice }: { notice: NoticePopup | null }) {
  const stored = useSyncExternalStore(
    subscribePopupStorage,
    () => popupStorageSnapshot(notice?.id ?? null),
    () => "pending",
  );
  const [memoryHiddenId, setMemoryHiddenId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const router = useRouter();
  const ready = stored !== "pending";
  const open = stored === "visible" && !!notice && memoryHiddenId !== notice.id;
  const src = notice ? publicImageUrl(notice.image_path) : null;
  const closeForSession = () => {
    if (!notice) return;
    try {
      const session = store("sessionStorage");
      if (session) rememberSession(session, notice.id);
    } catch {
      /* 저장이 불가능하면 이 화면의 메모리 닫기만 유지한다. */
    }
    setMemoryHiddenId(notice.id);
  };
  return (
    <>
      <span hidden data-notice-popup-ready={ready ? "yes" : "no"} />
      {open && notice && (
        <Modal
          title="공지사항"
          busy={false}
          restoreFocusId="home-start"
          clearBottomTabs
          onClose={closeForSession}
          footer={
            <>
              <Button
                type="button"
                onClick={() => {
                  closeForSession();
                  router.push(`/notices/${notice.id}`);
                }}
              >
                공지 자세히 보기
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (!notice) return;
                  try {
                    const local = store("localStorage");
                    if (local)
                      rememberToday(local, store("sessionStorage"), notice.id);
                  } catch {
                    /* 저장이 불가능하면 이 화면의 메모리 닫기만 유지한다. */
                  }
                  setMemoryHiddenId(notice.id);
                }}
              >
                오늘 하루 보지 않기
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={closeForSession}
              >
                닫기
              </Button>
            </>
          }
        >
          <p className="font-bold wrap-anywhere">{notice.title}</p>
          {src &&
            (failed ? (
              <p role="status">이미지를 불러오지 못했습니다.</p>
            ) : (
              <Image
                unoptimized
                width={1200}
                height={1200}
                src={src}
                alt={notice.image_alt || "공지 이미지"}
                onError={() => setFailed(true)}
                data-notice-popup-image
                className="h-auto max-h-[30dvh] w-auto max-w-full object-contain"
              />
            ))}
          <p className="whitespace-pre-wrap wrap-anywhere text-body md:text-base">
            {summarizeNoticeBody(notice.body)}
          </p>
          <p className="text-sm text-muted">
            전체 내용은 공지 상세에서 확인해 주세요.
          </p>
        </Modal>
      )}
    </>
  );
}
