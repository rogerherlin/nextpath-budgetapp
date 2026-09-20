export class AgentMemoryStore {
  private readonly byUser = new Map<string, Map<string, string>>();

  remember(uid: string, key: string, value: string): void {
    let map = this.byUser.get(uid);
    if (map === undefined) {
      map = new Map();
      this.byUser.set(uid, map);
    }
    map.set(key, value);
  }

  recall(uid: string, key: string): string | null {
    const map = this.byUser.get(uid);
    if (map === undefined) {
      return null;
    }
    const found = map.get(key);
    return found === undefined ? null : found;
  }
}
