import {
  createPaginatedRowModel,
  createSortedRowModel,
  createTableHook,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
} from "@tanstack/react-table";

/**
 * TanStack Table v9 — useTable / tableFeatures / FlexRender.
 * Skills: @tanstack/react-table getting-started + create-table-hook (installed 9.2.4).
 */
const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
});

export const { createAppColumnHelper, useAppTable } = createTableHook({
  features,
  getRowId: (row: { id: string }) => row.id,
});
