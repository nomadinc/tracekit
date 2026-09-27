export function sumPortfolioRows(rows: Record<string, unknown>[], field: string) {
  return rows.reduce((total, row) => {
    const parsed = Number(row[field]);
    return total + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);
}
