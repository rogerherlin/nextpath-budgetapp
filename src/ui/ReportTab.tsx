import { listBudgets } from "../budgets";
import { formatMoney } from "../money";
import { buildReport, type ReportLine } from "../report";

function actualMoneyClass(actualCents: number, targetCents: number | null): string {
  if (targetCents === null) {
    return "money";
  }
  if (actualCents >= targetCents) {
    return "money money--ahead";
  }
  return "money money--short";
}

function TotalLines({ lines }: { lines: ReportLine[] }) {
  return (
    <>
      {lines.map((line) => (
        <p className="report-line" key={line.name}>
          <span>{line.name}</span>
          <span className="money">{formatMoney(line.totalCents)}</span>
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
      <div className="report-block">
        <TotalLines lines={report.income} />
      </div>
      <div className="report-block">
        <TotalLines lines={report.expense} />
      </div>
      <div className="report-summary">
        <p className="report-summary__actual">
          <span>Actual balance</span>
          <span className={actualMoneyClass(report.actualCents, report.targetCents)}>
            {formatMoney(report.actualCents)}
          </span>
        </p>
        {report.targetCents !== null ? (
          <p>
            <span>Target leftover</span>
            <span className="money">{formatMoney(report.targetCents)}</span>
          </p>
        ) : null}
      </div>
    </>
  );
}
