import {
  columnVisibilityFeature,
  createPaginatedRowModel,
  createSortedRowModel,
  createTableHook,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
} from "@tanstack/react-table";

/**
 * TanStack Table v9 — one hook for every KluCoach admin list.
 * Skills: getting-started, table-state, with-tanstack-query (installed 9.2.4).
 */
const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
});

export const { createAppColumnHelper, useAppTable } = createTableHook({
  features,
  getRowId: (row: { id: string }) => row.id,
});

export type { SortingState } from "@tanstack/react-table";
