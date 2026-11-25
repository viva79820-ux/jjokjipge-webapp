import { Phone } from "lucide-react";
import { appFixedBarClass } from "@/lib/app-frame";
import {
  classInquiryLabel,
  classInquiryPhoneDisplay,
  classInquiryPhoneHref,
} from "@/lib/classes/inquiry";
import { publicVideoHref } from "@/lib/classes/rules";

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function ClassInquiryBar({ videoUrl }: { videoUrl: string | null }) {
  const href = publicVideoHref(videoUrl);
  return (
    <div
      data-class-inquiry
      className={`${appFixedBarClass} z-30 flex items-center gap-2 border-t border-border bg-surface px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]`}
    >
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-brand bg-surface px-4 text-label font-bold text-brand ${focus}`}
        >
          영상
        </a>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <a
          href={classInquiryPhoneHref}
          className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-brand px-4 text-label font-bold text-on-brand ${focus}`}
        >
          <Phone size={18} aria-hidden="true" />
          {classInquiryLabel}
        </a>
        <p className="text-center text-caption text-muted">
          {classInquiryPhoneDisplay}
        </p>
      </div>
    </div>
  );
}
