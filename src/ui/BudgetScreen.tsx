import { useState } from "react";
import { CategoriesTab } from "./CategoriesTab";
import { EntriesTab } from "./EntriesTab";

const TABS = [
  { label: "Categories", id: "categories" },
  { label: "Income", id: "income" },
  { label: "Expenses", id: "expenses" },
  { label: "Report", id: "report" },
] as const;

type TabId = (typeof TABS)[number]["id"] | null;

export function BudgetScreen({ budgetId }: { budgetId: string }) {
  const [tab, setTab] = useState<TabId>(null);
  return (
    <>
      {TABS.map((item) => (
        <button key={item.id} type="button" onClick={() => setTab(item.id)}>
          {item.label}
        </button>
      ))}
      {tab === "categories" ? <CategoriesTab budgetId={budgetId} /> : null}
      {tab === "income" ? <EntriesTab /> : null}
    </>
  );
}
