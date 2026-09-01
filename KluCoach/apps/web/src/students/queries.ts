import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export type StudentListRow = {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  status: string;
  branch?: { name: string };
  enrollments: { batch: { name: string } }[];
};

export function useStudentsQuery(q: string) {
  return useQuery({
    queryKey: ["students", q],
    queryFn: () => api<StudentListRow[]>(`/students${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });
}
