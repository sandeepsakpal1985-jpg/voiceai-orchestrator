export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export function listQuery(opts: {
  pageIndex: number;
  pageSize?: number;
  q?: string;
  sort?: string;
  dir?: "asc" | "desc";
  extra?: Record<string, string | undefined>;
}) {
  const sp = new URLSearchParams();
  sp.set("page", String(opts.pageIndex + 1));
  sp.set("pageSize", String(opts.pageSize ?? 25));
  if (opts.q) sp.set("q", opts.q);
  if (opts.sort) sp.set("sort", opts.sort);
  if (opts.dir) sp.set("dir", opts.dir);
  for (const [key, value] of Object.entries(opts.extra ?? {})) {
    if (value) sp.set(key, value);
  }
  return sp.toString();
}
