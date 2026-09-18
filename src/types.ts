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

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  canUseFromText: boolean;
  createdAt: string;
}

export type MeProfile = UserProfile & { isModerator: boolean };

export interface DirectoryUser {
  id: string;
  email: string;
  displayName: string;
}

export type Visibility = "public" | "hidden";

export type GrantRole = "see" | "browse" | "edit";

export interface Grant {
  userId: string;
  role: GrantRole;
}

export interface Actor {
  profile: UserProfile;
  isModerator: boolean;
}

export type ViewerRelation =
  | "owner"
  | "moderator"
  | "edit"
  | "browse"
  | "see"
  | "public";

export interface BudgetSummary {
  id: string;
  name: string;
  ownerId: string;
  ownerDisplayName: string;
  visibility: Visibility;
  startDate: DateParts | null;
  endDate: DateParts | null;
  viewerRelation: ViewerRelation;
}

export interface Budget {
  id: string;
  name: string;
  ownerId: string;
  visibility: Visibility;
  grants: Grant[];
  description: string;
  startDate: DateParts | null;
  endDate: DateParts | null;
  targetLeftoverCents: number | null;
  incomeCategories: Category[];
  expenseCategories: Category[];
  incomeEntries: Entry[];
  expenseEntries: Entry[];
}
