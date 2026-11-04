import { useState } from "react";
import type { AdminBlogPost } from "@semico/shared";
import { ApiError } from "@/api";
import { useAdminBlog, useBlogMutations } from "@/features/admin/useAdminCms";
import { BlogPostForm } from "@/features/admin/BlogPostForm";
import {
  CmsButton,
  CmsFeedback,
  CmsPagination,
} from "@/features/admin/CmsControls";
import { useLanguage } from "../../contexts/LanguageContext";
import { useLocalized } from "../../hooks/useLocalized";
import { useTokens } from "../../hooks/useTokens";

export function AdminBlog() {
  const { t, lang } = useLanguage();
  const copy = t.admin.cms;
  const tokens = useTokens();
  const localize = useLocalized();
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<AdminBlogPost | "new" | null>(null);
  const [notice, setNotice] = useState("");
  const query = useAdminBlog(page);
  const { save, remove } = useBlogMutations();
  const busy = save.isPending || remove.isPending;
  const result = query.isError ? undefined : query.data;
  const dates = new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  function resetMessages() {
    save.reset();
    remove.reset();
    setNotice("");
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t.admin.blog}</h1>
          <p className="mt-2 text-sm" style={{ color: tokens.sec }}>
            {copy.blogDescription}
          </p>
        </div>
        <CmsButton
          disabled={busy || editor !== null}
          onClick={() => {
            resetMessages();
            setEditor("new");
          }}
        >
          {copy.addPost}
        </CmsButton>
      </div>
      {notice && (
        <p role="status" style={{ color: tokens.green }}>
          {notice}
        </p>
      )}
      {remove.isError && (
        <p role="alert" style={{ color: tokens.crit }}>
          {copy.saveError}
        </p>
      )}
      {editor !== null && (
        <BlogPostForm
          key={editor === "new" ? "new" : editor.id}
          initialPost={editor === "new" ? undefined : editor}
          pending={busy}
          error={
            save.isError
              ? save.error instanceof ApiError && save.error.code === "CONFLICT"
                ? copy.slugInUse
                : copy.saveError
              : null
          }
          onCancel={() => setEditor(null)}
          onSave={(input) => {
            resetMessages();
            save.mutate(
              { id: editor === "new" ? undefined : editor.id, input },
              {
                onSuccess: () => {
                  setEditor(null);
                  setPage(1);
                  setNotice(copy.saved);
                },
              },
            );
          }}
        />
      )}
      <CmsFeedback
        loading={query.isPending}
        error={query.isError}
        retry={() => {
          void query.refetch();
        }}
      />
      {result && result.data.length === 0 && <p>{copy.noPosts}</p>}
      {result && result.data.length > 0 && (
        <div
          className="overflow-x-auto rounded-xl border"
          style={{ borderColor: tokens.border }}
        >
          <table
            className="w-full min-w-[680px] text-sm text-start"
            aria-label={t.admin.blog}
            style={{ background: tokens.card }}
          >
            <thead style={{ background: tokens.thead }}>
              <tr>
                <th scope="col" className="p-4 text-start">
                  {t.admin.blog}
                </th>
                <th scope="col" className="p-4 text-start">
                  {copy.category}
                </th>
                <th scope="col" className="p-4 text-start">
                  {copy.status}
                </th>
                <th scope="col" className="p-4 text-start">
                  {copy.publishedDate}
                </th>
                <th scope="col" className="p-4 text-start">
                  {copy.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((post) => (
                <tr
                  key={post.id}
                  className="border-t"
                  style={{ borderColor: tokens.border }}
                >
                  <td className="p-4">
                    <bdi>{localize(post.title)}</bdi>
                    <p className="mt-1 text-xs" style={{ color: tokens.sec }}>
                      <bdi dir="ltr">{post.slug}</bdi>
                    </p>
                  </td>
                  <td className="p-4">{localize(post.categoryLabel)}</td>
                  <td className="p-4">
                    {post.published ? copy.published : copy.draft}
                  </td>
                  <td className="p-4">
                    <time dateTime={post.publishedAt}>
                      {dates.format(new Date(post.publishedAt))}
                    </time>
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <CmsButton
                        disabled={busy || editor !== null}
                        onClick={() => {
                          resetMessages();
                          setEditor(post);
                        }}
                      >
                        {copy.edit}
                      </CmsButton>
                      <CmsButton
                        danger
                        disabled={busy || editor !== null}
                        onClick={() => {
                          if (!window.confirm(copy.deletePostConfirm)) return;
                          resetMessages();
                          remove.mutate(post.id, {
                            onSuccess: () => {
                              setPage(1);
                              setNotice(copy.saved);
                            },
                          });
                        }}
                      >
                        {copy.delete}
                      </CmsButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <CmsPagination
        meta={result?.meta}
        busy={busy || editor !== null}
        onPageChange={setPage}
      />
    </div>
  );
}
