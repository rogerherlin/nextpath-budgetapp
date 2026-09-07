import { listBudgets } from "../budgets";
import { formatMoney } from "../money";
import { buildReport, type ReportLine } from "../report";

function TotalLines({ lines }: { lines: ReportLine[] }) {
  return (
    <>
      {lines.map((line) => (
        <p key={line.name}>
          <span>{line.name}</span>
          <span>{formatMoney(line.totalCents)}</span>
        </p>
      ))}
    </>
  );
}

export function ReportTab({ budgetId }: { budgetId: string }) {
  const budget = listBudgets().find((item) => item.id === budgetId);
  if (!budget) {
    return null;
  }
  const report = buildReport(budget);
  return (
    <>
      <TotalLines lines={report.income} />
      <TotalLines lines={report.expense} />
      <p>
        <span>Actual balance</span>
        <span>{formatMoney(report.actualCents)}</span>
      </p>
      {report.targetCents !== null ? (
        <p>
          <span>Target leftover</span>
          <span>{formatMoney(report.targetCents)}</span>
        </p>
      ) : null}
    </>
  );
}
