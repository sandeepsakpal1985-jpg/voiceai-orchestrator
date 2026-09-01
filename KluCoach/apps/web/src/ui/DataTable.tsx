import { type ReactNode } from "react";
import { useAppTable, type SortingState } from "./table-engine";

type Row = { id: string };

export function DataTable<T extends Row>({
  columns,
  data,
  empty = "No rows",
  total,
  pageIndex = 0,
  pageSize = 25,
  onPageChange,
  sorting,
  onSortingChange,
  search,
  onSearchChange,
  searchPlaceholder = "Search",
  filters,
  loading,
  error,
  rowActions,
  onRowClick,
  bulkActions,
  selectable,
}: {
  columns: any;
  data: T[];
  empty?: string;
  total?: number;
  pageIndex?: number;
  pageSize?: number;
  onPageChange?: (pageIndex: number) => void;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  search?: string;
  onSearchChange?: (q: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  loading?: boolean;
  error?: string | null;
  rowActions?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  bulkActions?: (selected: T[]) => ReactNode;
  selectable?: boolean;
}) {
  const server = total != null;
  const pageCount = server ? Math.max(1, Math.ceil(total / pageSize)) : undefined;
  const table = useAppTable({
    data,
    columns,
    manualPagination: server,
    manualSorting: Boolean(onSortingChange),
    rowCount: total,
    state: {
      pagination: { pageIndex, pageSize },
      ...(sorting ? { sorting } : {}),
    },
    onPaginationChange: onPageChange
      ? (updater) => {
          const current = { pageIndex, pageSize };
          const next = typeof updater === "function" ? updater(current) : updater;
          onPageChange(next.pageIndex);
        }
      : undefined,
    onSortingChange: onSortingChange
      ? (updater) => {
          const current = sorting ?? [];
          const next = typeof updater === "function" ? updater(current) : updater;
          onSortingChange(next);
        }
      : undefined,
    initialState: { pagination: { pageIndex: 0, pageSize } },
  });

  const rows = table.getRowModel().rows;
  const visibleCols = table.getVisibleLeafColumns();
  const selected = table.getSelectedRowModel().rows.map((r) => r.original as T);

  const colCount = visibleCols.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);

  return (
    <div className="datatable">
      <div className="datatable-toolbar">
        {onSearchChange ? (
          <input
            aria-label="Search"
            placeholder={searchPlaceholder}
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{ maxWidth: 260 }}
          />
        ) : null}
        {filters}
        <details className="column-menu">
          <summary>Columns</summary>
          <div className="column-menu-list">
            {table.getAllLeafColumns().map((col) => (
              <label key={col.id} className="hint" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={col.getIsVisible()}
                  onChange={col.getToggleVisibilityHandler()}
                />
                Show {typeof col.columnDef.header === "string" ? col.columnDef.header : col.id}
              </label>
            ))}
          </div>
        </details>
      </div>
      {selectable && bulkActions && selected.length > 0 ? (
        <div className="datatable-bulk">{bulkActions(selected)}</div>
      ) : null}
      {error ? <p className="err">{error}</p> : null}
      {loading ? <p className="hint">Loading…</p> : null}
      {!loading ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {selectable ? (
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select all rows"
                        checked={table.getIsAllRowsSelected()}
                        onChange={table.getToggleAllRowsSelectedHandler()}
                      />
                    </th>
                  ) : null}
                  {group.headers.map((header) => (
                    <th key={header.id}>
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: "4px 8px", width: "auto" }}
                          onClick={() => header.column.toggleSorting()}
                        >
                          <table.FlexRender header={header} />
                        </button>
                      )}
                    </th>
                  ))}
                  {rowActions ? <th>Actions</th> : null}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(colCount, 1)}>{empty}</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className={onRowClick ? "table-row-click" : undefined}
                    onClick={() => onRowClick?.(row.original as T)}
                  >
                    {selectable ? (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label="Select row"
                          checked={row.getIsSelected()}
                          onChange={row.getToggleSelectedHandler()}
                        />
                      </td>
                    ) : null}
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                    {rowActions ? (
                      <td onClick={(e) => e.stopPropagation()}>{rowActions(row.original as T)}</td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="hint" style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn secondary"
          onClick={() => (onPageChange ? onPageChange(Math.max(0, pageIndex - 1)) : table.previousPage())}
          disabled={onPageChange ? pageIndex <= 0 : !table.getCanPreviousPage()}
        >
          Previous
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={() => (onPageChange ? onPageChange(pageIndex + 1) : table.nextPage())}
          disabled={
            onPageChange
              ? pageIndex + 1 >= (pageCount ?? 1)
              : !table.getCanNextPage()
          }
        >
          Next
        </button>
        <span>
          Page {pageIndex + 1} of {pageCount ?? table.getPageCount() ?? 1}
          {server ? ` · ${total} total` : ""}
        </span>
      </div>
    </div>
  );
}
