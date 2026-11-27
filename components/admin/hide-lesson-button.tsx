"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { hideLectureLesson } from "@/lib/lectures/admin";

export function HideLessonButton({
  lectureId,
  lessonId,
}: {
  lectureId: string;
  lessonId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        차시 숨기기
      </Button>
      {open ? (
        <Modal
          title="차시를 숨길까요?"
          busy={false}
          onClose={() => setOpen(false)}
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                취소
              </Button>
              <form action={hideLectureLesson}>
                <input type="hidden" name="lecture_id" value={lectureId} />
                <input type="hidden" name="id" value={lessonId} />
                <Button type="submit">차시 숨기기</Button>
              </form>
            </>
          }
        >
          <p className="text-body">
            이 차시는 공개 목록과 재생에서 빠져요. 다시 공개할 수 없어요.
          </p>
        </Modal>
      ) : null}
    </>
  );
}
