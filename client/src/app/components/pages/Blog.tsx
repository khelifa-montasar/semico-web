import { useState } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useLocalized } from "../../hooks/useLocalized";
import { useBlogPosts } from "../../../features/content/useContent";

export function Blog() {
  const { t, font } = useLanguage();
  const L = useLocalized();
  const b = t.blog;
  const [filter, setFilter] = useState("all");

  const posts = useBlogPosts();
  const all = posts.data ?? [];

  /**
   * Pills are derived from the posts rather than hardcoded, so a new category added server-side
   * appears on its own. Labels come from the API's `categoryLabel`, which carries both languages.
   */
  const categories = Array.from(
    new Map(all.map((post) => [post.category, post.categoryLabel])).entries(),
  );

  const cats = [
    { key: "all", label: b.all },
    ...categories.map(([key, label]) => ({ key, label: L(label) })),
  ];

  // Filtered client-side: the list is small, so the pills respond instantly instead of refetching.
  const filtered = filter === "all" ? all : all.filter((post) => post.category === filter);

  return (
    <div className="max-w-[720px] mx-auto px-6 py-16" style={{ fontFamily: font }}>
      <h1
        className="text-[24px] text-[#1A1A1A] text-center mb-8"
        style={{ fontFamily: font, fontWeight: 400 }}
      >
        {b.title}
      </h1>

      <div className="flex gap-2 justify-center mb-10">
        {cats.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`px-4 py-1.5 rounded-full text-[13px] transition-colors ${
              filter === c.key
                ? "bg-[#1A1A1A] text-white"
                : "bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]"
            }`}
            style={{ fontFamily: font }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {posts.isError && (
        <p className="text-[13px] text-center text-[#FF6B35]">
          {posts.error instanceof Error ? posts.error.message : "Could not load articles."}
        </p>
      )}

      <div className="flex flex-col">
        {!posts.isLoading && !posts.isError && filtered.length === 0 && (
          <p className="text-[13px] text-center text-[#9CA3AF]">No articles yet.</p>
        )}

        {filtered.map((post, i) => (
          <div key={post.id}>
            <article className="py-6 cursor-pointer group">
              <span
                className="text-[11px] text-[#9CA3AF] block mb-1"
                style={{ fontFamily: "JetBrains Mono" }}
              >
                {/* Publish date only — the timestamp's time component is meaningless to a reader. */}
                {post.publishedAt.slice(0, 10)}
              </span>
              <h3
                className="text-[16px] text-[#1A1A1A] group-hover:text-[#00A859] transition-colors mb-1"
                style={{ fontFamily: font, fontWeight: 500 }}
              >
                {L(post.title)}
              </h3>
              <p
                className="text-[13px] text-[#9CA3AF]"
                style={{ fontFamily: font, lineHeight: 1.6 }}
              >
                {L(post.excerpt)}
              </p>
            </article>
            {i < filtered.length - 1 && <div className="h-px bg-[#EAECF0]" />}
          </div>
        ))}
      </div>
    </div>
  );
}
