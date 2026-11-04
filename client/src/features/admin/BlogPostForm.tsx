import { useId, useState, type FormEvent } from "react";
import {
  createBlogPostSchema,
  type AdminBlogPost,
  type BlogCategory,
  type CreateBlogPostInput,
} from "@semico/shared";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useTokens } from "@/app/hooks/useTokens";
import { CmsButton, CmsField } from "./CmsControls";
import {
  blogFormDefaults,
  blogFormInput,
  type BlogFormState,
} from "./cmsForms";

interface BlogPostFormProps {
  initialPost?: AdminBlogPost;
  pending?: boolean;
  error?: string | null;
  onSave: (input: CreateBlogPostInput) => void;
  onCancel: () => void;
}

export function BlogPostForm({
  initialPost,
  pending,
  error,
  onSave,
  onCancel,
}: BlogPostFormProps) {
  const { t } = useLanguage();
  const copy = t.admin.cms;
  const tokens = useTokens();
  const categoryId = useId();
  const [form, setForm] = useState(() => blogFormDefaults(initialPost));
  const [invalid, setInvalid] = useState(false);
  function change(fields: Partial<BlogFormState>) {
    setForm((current) => ({ ...current, ...fields }));
    setInvalid(false);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = createBlogPostSchema.safeParse(
      blogFormInput(form, initialPost),
    );
    if (!result.success) {
      setInvalid(true);
      return;
    }
    onSave(result.data);
  }
  return (
    <form
      onSubmit={submit}
      className="rounded-xl border p-5 space-y-4"
      style={{ background: tokens.card, borderColor: tokens.border }}
    >
      <h2 className="text-lg font-medium">
        {initialPost ? copy.edit : copy.addPost}
      </h2>
      {(invalid || error) && (
        <p role="alert" style={{ color: tokens.crit }}>
          {invalid ? copy.invalidInput : error}
        </p>
      )}
      <fieldset disabled={pending} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <CmsField
            label={copy.titleEn}
            language="en"
            value={form.titleEn}
            onChange={(value) => change({ titleEn: value })}
            required
            maxLength={200}
          />
          <CmsField
            label={copy.titleAr}
            language="ar"
            value={form.titleAr}
            onChange={(value) => change({ titleAr: value })}
            required
            maxLength={200}
          />
          <CmsField
            label={copy.excerptEn}
            language="en"
            value={form.excerptEn}
            onChange={(value) => change({ excerptEn: value })}
            multiline
            maxLength={600}
          />
          <CmsField
            label={copy.excerptAr}
            language="ar"
            value={form.excerptAr}
            onChange={(value) => change({ excerptAr: value })}
            multiline
            maxLength={600}
          />
          <CmsField
            label={copy.bodyEn}
            language="en"
            value={form.bodyEn}
            onChange={(value) => change({ bodyEn: value })}
            multiline
            required
            maxLength={50_000}
          />
          <CmsField
            label={copy.bodyAr}
            language="ar"
            value={form.bodyAr}
            onChange={(value) => change({ bodyAr: value })}
            multiline
            required
            maxLength={50_000}
          />
          <CmsField
            label={copy.slug}
            language="en"
            value={form.slug}
            onChange={(value) => change({ slug: value })}
            required
            maxLength={160}
          />
          <label htmlFor={categoryId} className="flex flex-col gap-2 text-sm">
            <span>{copy.category}</span>
            <select
              id={categoryId}
              value={form.category}
              onChange={(event) =>
                change({ category: event.target.value as BlogCategory })
              }
              className="rounded-lg border px-3 py-2"
              style={{
                background: tokens.inputBg,
                color: tokens.text,
                borderColor: tokens.border,
              }}
            >
              <option value="TECHNOLOGY">{copy.technology}</option>
              <option value="GUIDES">{copy.guides}</option>
            </select>
          </label>
          <CmsField
            label={copy.publishedDate}
            type="date"
            language="en"
            value={form.publishedDate}
            onChange={(value) => change({ publishedDate: value })}
            required
          />
          <CmsField
            label={copy.sortOrder}
            type="number"
            language="en"
            value={form.sortOrder}
            onChange={(value) => change({ sortOrder: value })}
            min={0}
            step="1"
            required
          />
        </div>
        <CmsField
          label={copy.coverImage}
          type="url"
          language="en"
          value={form.coverImageUrl}
          onChange={(value) => change({ coverImageUrl: value })}
          maxLength={2000}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(event) => change({ published: event.target.checked })}
          />
          {copy.publishPost}
        </label>
        <div className="flex gap-3">
          <CmsButton type="submit">{copy.save}</CmsButton>
          <CmsButton onClick={onCancel}>{copy.cancel}</CmsButton>
        </div>
      </fieldset>
    </form>
  );
}
