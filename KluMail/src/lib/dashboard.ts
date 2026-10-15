export type QueueCounts = {
  open: number;
  inProgress: number;
  pending: number;
  resolved: number;
  closed: number;
  unassigned: number;
  createdInPeriod: number;
};

export function emptyQueue(): QueueCounts {
  return { open: 0, inProgress: 0, pending: 0, resolved: 0, closed: 0, unassigned: 0, createdInPeriod: 0 };
}

export function sumCounts(rows: { key: string; count: number }[]): number {
  return rows.reduce((total, row) => total + row.count, 0);
}
