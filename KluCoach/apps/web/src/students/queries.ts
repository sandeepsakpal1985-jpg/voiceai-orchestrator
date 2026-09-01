import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { listQuery, type Paged } from "../lib/paged";

export type StudentListRow = {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  status: string;
  branch?: { name: string };
  enrollments: { batch: { name: string } }[];
};

export function useStudentsQuery(opts: {
  q: string;
  pageIndex: number;
  sort?: string;
  dir?: "asc" | "desc";
  status?: string;
  batchId?: string;
}) {
  const qs = listQuery({
    pageIndex: opts.pageIndex,
    q: opts.q,
    sort: opts.sort,
    dir: opts.dir,
    extra: { status: opts.status, batchId: opts.batchId },
  });
  return useQuery({
    queryKey: ["students", qs],
    queryFn: () => api<Paged<StudentListRow>>(`/students?${qs}`),
    placeholderData: keepPreviousData,
  });
}
