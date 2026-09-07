import { useEffect, useState } from "react";
import { hydrateFromServer } from "./clientStore";
import { BudgetScreen } from "./ui/BudgetScreen";
import { HomeScreen } from "./ui/HomeScreen";

export function App() {
  const [budgetId, setBudgetId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void hydrateFromServer().then((result) => {
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setReady(true);
    });
  }, []);

  if (loadError) {
    return (
      <main>
        <h1>Budgets</h1>
        <p>{loadError}</p>
      </main>
    );
  }

  if (!ready) {
    return (
      <main>
        <h1>Budgets</h1>
      </main>
    );
  }

  if (budgetId) {
    return (
      <main>
        <BudgetScreen budgetId={budgetId} onBack={() => setBudgetId(null)} />
      </main>
    );
  }

  return (
    <main>
      <h1>Budgets</h1>
      <HomeScreen onOpen={setBudgetId} />
    </main>
  );
}
