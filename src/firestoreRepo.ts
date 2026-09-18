import type { Firestore } from "firebase-admin/firestore";
import type { AppRepo } from "./repo";
import type { Budget, UserProfile } from "./types";

export class FirestoreRepo implements AppRepo {
  constructor(private readonly db: Firestore) {}

  private users() {
    return this.db.collection("users");
  }

  private budgetsCol() {
    return this.db.collection("budgets");
  }

  async profileCount(): Promise<number> {
    const snap = await this.users().count().get();
    return snap.data().count;
  }

  async getProfile(id: string): Promise<UserProfile | null> {
    const snap = await this.users().doc(id).get();
    if (!snap.exists) {
      return null;
    }
    return snap.data() as UserProfile;
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    await this.users().doc(profile.id).set(profile);
  }

  async listProfiles(): Promise<UserProfile[]> {
    const snap = await this.users().get();
    return snap.docs.map((doc) => doc.data() as UserProfile);
  }

  async budgetCount(): Promise<number> {
    const snap = await this.budgetsCol().count().get();
    return snap.data().count;
  }

  async getBudgetDoc(id: string): Promise<Budget | null> {
    const snap = await this.budgetsCol().doc(id).get();
    if (!snap.exists) {
      return null;
    }
    return snap.data() as Budget;
  }

  async saveBudget(budget: Budget): Promise<void> {
    await this.budgetsCol().doc(budget.id).set(budget);
  }

  async removeBudget(id: string): Promise<void> {
    await this.budgetsCol().doc(id).delete();
  }

  async listBudgetDocs(): Promise<Budget[]> {
    const snap = await this.budgetsCol().get();
    return snap.docs.map((doc) => doc.data() as Budget);
  }
}
