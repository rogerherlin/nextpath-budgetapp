import { listBudgets } from "../budgets";

export function deleteBudgetConfirmMessage(name: string): string {
  return `Delete budget “${name}”? This cannot be undone.`;
}

export function HomeScreen() {
  const budgets = listBudgets();
  if (budgets.length === 0) {
    return (
      <>
        <p>No budgets yet.</p>
        <button type="button">New budget</button>
      </>
    );
  }
  return (
    <ul>
      {budgets.map((budget) => (
        <li key={budget.id}>
          <span>{budget.name}</span>
          <button type="button">Open</button>
          <button type="button">Copy</button>
          <button
            type="button"
            onClick={() => {
              window.confirm(deleteBudgetConfirmMessage(budget.name));
            }}
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}
