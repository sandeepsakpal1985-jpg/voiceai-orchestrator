export type ListQuery = {
  page: number | null;
  pageSize: number;
  q: string;
  sort: string | undefined;
  dir: "asc" | "desc";
  status: string | undefined;
  batchId: string | undefined;
  branchId: string | undefined;
};

export function parseListQuery(query: Record<string, unknown>): ListQuery {
  const pageRaw = query.page;
  const page =
    pageRaw != null && String(pageRaw).length > 0 ? Math.max(1, Number(pageRaw) || 1) : null;
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25) || 25));
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const sort = typeof query.sort === "string" && query.sort.length ? query.sort : undefined;
  const dir = query.dir === "desc" ? "desc" : "asc";
  const status = typeof query.status === "string" && query.status.length ? query.status : undefined;
  const batchId = typeof query.batchId === "string" && query.batchId.length ? query.batchId : undefined;
  const branchId = typeof query.branchId === "string" && query.branchId.length ? query.branchId : undefined;
  return { page, pageSize, q, sort, dir, status, batchId, branchId };
}

export function listSkipTake(list: ListQuery) {
  if (list.page == null) return { skip: undefined, take: 200 };
  return { skip: (list.page - 1) * list.pageSize, take: list.pageSize };
}

export function sendList<T>(list: ListQuery, items: T[], total: number) {
  if (list.page == null) return items;
  return { items, total, page: list.page, pageSize: list.pageSize };
}

export function orderBy<T extends string>(
  sort: string | undefined,
  dir: "asc" | "desc",
  allowed: readonly T[],
  fallback: T,
): Record<T, "asc" | "desc"> {
  const key = (allowed.includes(sort as T) ? sort : fallback) as T;
  return { [key]: dir } as Record<T, "asc" | "desc">;
}
