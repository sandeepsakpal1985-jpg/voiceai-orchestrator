import { z } from "zod";
import { PRIORITIES, TICKET_STATUSES, VIEWS, type TicketQuery } from "@/lib/types";

const querySchema = z.object({
  view: z.enum(VIEWS).optional(),
  status: z.union([z.enum(TICKET_STATUSES), z.array(z.enum(TICKET_STATUSES))]).optional(),
  priority: z.union([z.enum(PRIORITIES), z.array(z.enum(PRIORITIES))]).optional(),
  assigneeId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  mailboxId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort: z.enum(["created_at", "last_activity_at", "priority", "status"]).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function parseTicketQuery(input: unknown): TicketQuery {
  const parsed = querySchema.parse(input);
  return {
    view: parsed.view ?? "all",
    status: asArray(parsed.status),
    priority: asArray(parsed.priority),
    assigneeId: parsed.assigneeId,
    teamId: parsed.teamId,
    mailboxId: parsed.mailboxId,
    categoryId: parsed.categoryId,
    tagId: parsed.tagId,
    q: parsed.q || undefined,
    from: parsed.from,
    to: parsed.to,
    sort: parsed.sort ?? "last_activity_at",
    direction: parsed.direction ?? "desc",
    page: parsed.page ?? 1,
    pageSize: parsed.pageSize ?? 25,
  };
}

export function parseSearchParams(params: URLSearchParams): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    result[key] = values.length > 1 ? values : (values[0] ?? "");
  }
  return result;
}
