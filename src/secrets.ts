/** Local `.env` or Cloud Run Secret Manager → process env. Never bake into the image. */

export function readGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY ?? "";
}

export function readModeratorEmail(): string {
  return process.env.MODERATOR_EMAIL ?? "";
}

export function readFirebaseWebConfig(): {
  apiKey: string;
  authDomain: string;
  projectId: string;
} {
  return {
    apiKey: process.env.FIREBASE_WEB_API_KEY ?? "",
    authDomain: process.env.FIREBASE_WEB_AUTH_DOMAIN ?? "",
    projectId: process.env.FIREBASE_WEB_PROJECT_ID ?? "",
  };
}

export function persistAdapterName(): "firestore" | "memory" {
  return process.env.BUDGETAPP_MEMORY_REPO === "1" ? "memory" : "firestore";
}
