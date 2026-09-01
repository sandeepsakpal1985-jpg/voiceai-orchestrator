import { useAppTable } from "./table-engine";

type Row = { id: string };

export function DataTable<T extends Row>({
  columns,
  data,
  empty = "No rows",
}: {
  columns: any;
  data: T[];
  empty?: string;
}) {
  const table = useAppTable({
    data,
    columns,
    initialState: { pagination: { pageIndex: 0, pageSize: 25 } },
  });

  const rows = table.getRowModel().rows;
  const colCount = table.getAllColumns().length;
  return (
    <div>
      <table className="table">
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
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
              <tr key={row.id}>
                {row.getAllCells().map((cell) => (
                  <td key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="hint" style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" className="btn secondary" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          Previous
        </button>
        <button type="button" className="btn secondary" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Next
        </button>
        <span>
          Page {table.state.pagination.pageIndex + 1} of {table.getPageCount() || 1}
        </span>
      </div>
    </div>
  );
}
