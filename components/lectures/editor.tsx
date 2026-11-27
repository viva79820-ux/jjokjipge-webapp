"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  prepareLectureUpload,
  removeLectureUpload,
  saveLecture,
} from "@/lib/lectures/actions";
import { inspectImage, uploadImage } from "@/lib/lectures/upload";
import {
  consentStatement,
  fieldLabel,
  type LectureRecord,
} from "@/lib/lectures/rules";
import { LectureThumbnail } from "./thumbnail";

const inputClass =
  "mt-1 w-full min-h-11 min-w-0 rounded-input border border-border bg-surface p-3 text-body outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function LectureEditor({
  mode,
  initial,
  userId,
  needsConsent,
  thumbnailUrl,
}: {
  mode: "create" | "update";
  initial: LectureRecord | null;
  userId: string;
  needsConsent: boolean;
  thumbnailUrl: string | null;
}) {
  const router = useRouter();
  const prefix = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const draftId = useRef(initial?.id || crypto.randomUUID());
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [field, setField] = useState(initial?.field || "saju");
  const [published, setPublished] = useState(
    initial ? (initial.is_published ? "true" : "false") : "false",
  );
  const [consent, setConsent] = useState(false);
  const [version, setVersion] = useState(initial?.updated_at || "");
  const [preview, setPreview] = useState(thumbnailUrl);
  const [path, setPath] = useState(initial?.thumbnail_path || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    setErrors({});
    let uploaded: string | null = null;
    try {
      let nextPath = path;
      const file = fileRef.current?.files?.[0];
      if (file) {
        const kind = await inspectImage(file);
        const reserved = await prepareLectureUpload(kind.ext);
        if (!reserved) throw Error("썸네일 업로드를 시작하지 못했어요.");
        uploaded = await uploadImage(createClient(), file, reserved, userId);
        nextPath = uploaded;
      }
      const form = new FormData();
      form.set("id", draftId.current);
      form.set("mode", mode);
      form.set("version", version);
      form.set("title", title);
      form.set("description", description);
      form.set("field", field);
      form.set("thumbnail_path", nextPath);
      form.set("is_published", published);
      if (consent) form.set("consent", "yes");
      const result = await saveLecture(form);
      if (result.state === "saved" && result.row) {
        setPath(result.row.thumbnail_path || "");
        setVersion(result.row.updated_at);
        setMessage(result.message);
        if (mode === "create") router.push(`/mypage/lectures/${result.row.id}`);
        else router.refresh();
        return;
      }
      if (uploaded) await removeLectureUpload(uploaded);
      setErrors(result.errors || {});
      setMessage(result.message);
      if (result.row) setVersion(result.row.updated_at);
    } catch (error) {
      if (uploaded) await removeLectureUpload(uploaded);
      setMessage(
        error instanceof Error
          ? error.message
          : "강의를 저장하지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 min-w-0 space-y-4">
      <div>
        <label htmlFor={`${prefix}-title`} className="text-label font-bold">
          제목
        </label>
        <input
          id={`${prefix}-title`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={inputClass}
          maxLength={100}
          required
        />
        {errors.title ? (
          <p className="mt-1 text-caption text-error">{errors.title}</p>
        ) : null}
      </div>
      <div>
        <label
          htmlFor={`${prefix}-description`}
          className="text-label font-bold"
        >
          소개
        </label>
        <textarea
          id={`${prefix}-description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className={`${inputClass} min-h-32`}
          maxLength={5000}
          required
        />
        {errors.description ? (
          <p className="mt-1 text-caption text-error">{errors.description}</p>
        ) : null}
      </div>
      <fieldset>
        <legend className="text-label font-bold">분야</legend>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(["saju", "tarot"] as const).map((value) => (
            <label
              key={value}
              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-full border px-3 text-label font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${field === value ? "border-brand bg-brand text-on-brand" : "border-border bg-surface text-foreground"}`}
            >
              <input
                type="radio"
                name="field"
                value={value}
                checked={field === value}
                onChange={() => setField(value)}
                className="sr-only"
              />
              {fieldLabel(value)}
            </label>
          ))}
        </div>
        {errors.field ? (
          <p className="mt-1 text-caption text-error">{errors.field}</p>
        ) : null}
      </fieldset>
      <div>
        <p className="text-label font-bold">썸네일</p>
        <div className="mt-2 flex min-w-0 items-center gap-3">
          <LectureThumbnail src={preview} alt={title || "강의 썸네일"} />
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full px-3 text-label font-bold text-brand has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand">
            이미지 선택
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const url = URL.createObjectURL(file);
                setPreview(url);
              }}
            />
          </label>
        </div>
        {errors.thumbnail_path ? (
          <p className="mt-1 text-caption text-error">
            {errors.thumbnail_path}
          </p>
        ) : null}
      </div>
      <fieldset>
        <legend className="text-label font-bold">공개 여부</legend>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {[
            ["false", "비공개"],
            ["true", "공개"],
          ].map(([value, label]) => (
            <label
              key={value}
              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-full border px-3 text-label font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${published === value ? "border-brand bg-brand text-on-brand" : "border-border bg-surface text-foreground"}`}
            >
              <input
                type="radio"
                name="is_published"
                value={value}
                checked={published === value}
                onChange={() => setPublished(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-caption text-muted">
          공개로 저장해도 고객용 강의 목록에는 아직 나오지 않아요. 모든 강의는
          무료입니다.
        </p>
      </fieldset>
      {needsConsent ? (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-card border border-border bg-surface p-3">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-1 size-5 shrink-0 accent-brand"
          />
          <span className="text-body">{consentStatement}</span>
        </label>
      ) : null}
      {errors.consent ? (
        <p role="alert" className="text-caption text-error">
          {errors.consent}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-body text-foreground">
          {message}
        </p>
      ) : null}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "저장하고 있어요" : "저장"}
      </Button>
    </form>
  );
}
