import { useQuery } from "@tanstack/react-query";
import { contentApi, queryKeys, referenceApi } from "@/api";

/**
 * Public marketing content.
 *
 * Given a long stale time on purpose: a price change or a new blog post is an editorial event, not
 * something a visitor should cause a refetch for. Ten minutes means someone browsing several pages
 * fetches the catalogue roughly once.
 */

const CONTENT_STALE_MS = 10 * 60_000;

/** Everything Home, About and Services need, in one round trip. */
export function useContentBundle() {
  return useQuery({
    queryKey: queryKeys.content.bundle(),
    queryFn: () => contentApi.bundle(),
    staleTime: CONTENT_STALE_MS,
  });
}

export function useProducts() {
  return useQuery({
    queryKey: queryKeys.content.products(),
    queryFn: () => contentApi.products(),
    staleTime: CONTENT_STALE_MS,
  });
}

/**
 * All published posts.
 *
 * The API accepts `?category=`, but the list is small enough that filtering client-side is better:
 * the pills then respond instantly instead of triggering a request per click. Switch to the
 * parameter if the archive ever grows past a page.
 */
export function useBlogPosts() {
  return useQuery({
    queryKey: queryKeys.content.blog(),
    queryFn: () => contentApi.blog(),
    staleTime: CONTENT_STALE_MS,
  });
}

/** The 58 Algerian wilayas, for the address dropdown on the signup and Settings forms. */
export function useWilayas() {
  return useQuery({
    queryKey: queryKeys.reference.wilayas(),
    queryFn: () => referenceApi.wilayas(),
    // Reference data: effectively static between deploys.
    staleTime: 60 * 60_000,
  });
}
