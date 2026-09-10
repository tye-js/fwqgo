import { createHash } from "node:crypto";

export class PostViewRateLimiter {
  private readonly claims = new Map<string, number>();

  constructor(
    private readonly windowMs = 60 * 60 * 1000,
    private readonly maxEntries = 10_000,
  ) {}

  claim(ip: string | null, slug: string, now = Date.now()) {
    // Unidentified requests must not cause unbounded analytics writes.
    if (!ip) return false;
    const key = createHash("sha256")
      .update(`${ip}\0${slug}`)
      .digest("hex")
      .slice(0, 32);
    if ((this.claims.get(key) ?? 0) > now) return false;
    if (this.claims.size >= this.maxEntries) {
      for (const [claim, expiresAt] of this.claims) {
        if (expiresAt <= now) this.claims.delete(claim);
      }
      while (this.claims.size >= this.maxEntries) {
        const oldest = this.claims.keys().next().value;
        if (!oldest) break;
        this.claims.delete(oldest);
      }
    }
    this.claims.set(key, now + this.windowMs);
    return key;
  }

  release(key: string) {
    this.claims.delete(key);
  }
}
