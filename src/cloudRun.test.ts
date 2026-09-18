import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readRoot(name: string): string {
  return readFileSync(join(root, name), "utf8");
}

function dockerignoreLines(): string[] {
  return readRoot(".dockerignore")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

describe("Cloud Run packaging", () => {
  it("AC1: Multi-stage Dockerfile", () => {
    const docker = readRoot("Dockerfile");
    expect(docker).toMatch(/FROM node:20-bookworm-slim AS builder/);
    expect(docker).toMatch(/RUN npm ci/);
    expect(docker).toMatch(/RUN npm run build/);
    expect(docker).toMatch(/FROM node:20-bookworm-slim\n/);
    expect(docker).toContain("COPY --from=builder /app/dist ./dist");
    expect(docker).toMatch(/COPY(?: --from=builder \/app\/src)? \.?\/?src \.\/src/);
    expect(docker).toContain("EXPOSE 8080");
    expect(docker).toContain('CMD ["npm","run","serve"]');
  });

  it("AC2: Image does not bake secrets", () => {
    const docker = readRoot("Dockerfile");
    expect(docker).not.toContain("COPY .env");
    expect(docker).not.toContain("GEMINI_API_KEY=");
    expect(docker).not.toContain("MODERATOR_EMAIL=");
    expect(docker.toLowerCase()).not.toContain("service-account");
    expect(docker).not.toContain("GOOGLE_APPLICATION_CREDENTIALS");
  });

  it("AC3: .dockerignore excludes secrets and catalog", () => {
    expect(existsSync(join(root, ".dockerignore"))).toBe(true);
    const lines = dockerignoreLines();
    expect(lines).toContain(".env");
    expect(lines).toContain("node_modules");
    expect(lines).toContain(".git");
    expect(lines).toContain("data/budgets.json");
  });

  it("AC4: Cloud Build tags Artifact Registry", () => {
    const yaml = readRoot("cloudbuild.yaml");
    expect(yaml).toContain("--platform=linux/amd64");
    expect(yaml).toContain("docker.pkg.dev/");
    expect(yaml).toContain("/budgetapp");
  });

  it("AC5: Runbook names Artifact Registry and Cloud Run", () => {
    const runbook = readRoot("specs/runbooks/cloud-run.md");
    expect(runbook).toContain("REGION-docker.pkg.dev/");
    expect(runbook).toContain("gcloud run deploy");
    expect(runbook).toContain("--allow-unauthenticated");
  });

  it("AC6: Runbook names Secret Manager mappings", () => {
    const runbook = readRoot("specs/runbooks/cloud-run.md");
    expect(runbook).toContain("Secret Manager");
    expect(runbook).toContain("GEMINI_API_KEY");
    expect(runbook).toContain("MODERATOR_EMAIL");
    expect(runbook).toContain("--set-secrets");
  });

  it("AC7: Runbook names runtime SA roles", () => {
    const runbook = readRoot("specs/runbooks/cloud-run.md");
    expect(runbook).toContain("roles/datastore.user");
    expect(runbook).toContain("roles/secretmanager.secretAccessor");
    expect(runbook).toContain("roles/firebaseauth.admin");
  });

  it("AC8: Runbook names Firebase authorized domains and public web config env", () => {
    const runbook = readRoot("specs/runbooks/cloud-run.md");
    expect(runbook).toContain("Authorized domains");
    expect(runbook).toContain(".run.app");
    expect(runbook).toContain("FIREBASE_WEB_API_KEY");
    expect(runbook).toContain("FIREBASE_WEB_AUTH_DOMAIN");
    expect(runbook).toContain("FIREBASE_WEB_PROJECT_ID");
  });

  it("AC9: Runbook distinguishes local Docker from emulators", () => {
    const runbook = readRoot("specs/runbooks/cloud-run.md");
    expect(runbook).toContain("firebase emulators:start");
    expect(runbook).toContain("FIRESTORE_EMULATOR_HOST");
    expect(runbook).toContain("FIREBASE_AUTH_EMULATOR_HOST");
    expect(runbook).toContain("host.docker.internal");
    expect(runbook).toContain(
      "Day-to-day local development does not use Docker.",
    );
  });

  it("AC10: tsx is a production dependency", () => {
    const pkg = JSON.parse(readRoot("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.tsx).toEqual(expect.any(String));
    expect(pkg.devDependencies?.tsx).toBeUndefined();
  });
});
