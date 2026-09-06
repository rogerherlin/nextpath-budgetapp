export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export interface Category {
  id: string;
  name: string;
}

export interface Entry {
  id: string;
  categoryId: string;
  comment: string;
  amountCents: number;
  date: DateParts | null;
}

export interface Budget {
  id: string;
  name: string;
  description: string;
  startDate: DateParts | null;
  endDate: DateParts | null;
  targetLeftoverCents: number | null;
  incomeCategories: Category[];
  expenseCategories: Category[];
  incomeEntries: Entry[];
  expenseEntries: Entry[];
}
