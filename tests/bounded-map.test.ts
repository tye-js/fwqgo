import assert from "node:assert/strict";
import test from "node:test";

import { reserveBoundedMapCapacity } from "@fwqgo/core/bounded-map";

type Entry = {
  status: "active" | "terminal";
  updatedAt: number;
};

const options = {
  maxEntries: 3,
  isEvictable: (entry: Entry) => entry.status === "terminal",
  getEvictionPriority: (entry: Entry) => entry.updatedAt,
};

void test("evicts the oldest terminal entry to reserve capacity", () => {
  const entries = new Map<string, Entry>([
    ["active", { status: "active", updatedAt: 1 }],
    ["new-terminal", { status: "terminal", updatedAt: 30 }],
    ["old-terminal", { status: "terminal", updatedAt: 10 }],
  ]);

  assert.equal(reserveBoundedMapCapacity(entries, options), true);
  assert.deepEqual([...entries.keys()], ["active", "new-terminal"]);
});

void test("preserves active entries and rejects capacity when none are evictable", () => {
  const entries = new Map<string, Entry>([
    ["first", { status: "active", updatedAt: 1 }],
    ["second", { status: "active", updatedAt: 2 }],
  ]);

  assert.equal(
    reserveBoundedMapCapacity(entries, { ...options, maxEntries: 2 }),
    false,
  );
  assert.deepEqual([...entries.keys()], ["first", "second"]);
});

void test("does not read eviction priority for active entries", () => {
  const entries = new Map<string, Entry>([
    ["active", { status: "active", updatedAt: 1 }],
    ["terminal", { status: "terminal", updatedAt: 2 }],
  ]);

  assert.equal(
    reserveBoundedMapCapacity(entries, {
      maxEntries: 2,
      isEvictable: (entry) => entry.status === "terminal",
      getEvictionPriority: (entry) => {
        assert.equal(entry.status, "terminal");
        return entry.updatedAt;
      },
    }),
    true,
  );
  assert.deepEqual([...entries.keys()], ["active"]);
});

void test("uses stable insertion order for equal eviction priorities", () => {
  const entries = new Map<string, Entry>([
    ["first", { status: "terminal", updatedAt: 10 }],
    ["second", { status: "terminal", updatedAt: 10 }],
    ["active", { status: "active", updatedAt: 0 }],
  ]);

  assert.equal(reserveBoundedMapCapacity(entries, options), true);
  assert.deepEqual([...entries.keys()], ["second", "active"]);
});

void test("can remove terminal entries without sacrificing active entries when still full", () => {
  const entries = new Map<string, Entry>([
    ["terminal", { status: "terminal", updatedAt: 1 }],
    ["active-a", { status: "active", updatedAt: 2 }],
    ["active-b", { status: "active", updatedAt: 3 }],
  ]);

  assert.equal(
    reserveBoundedMapCapacity(entries, {
      ...options,
      maxEntries: 2,
      incomingEntries: 2,
    }),
    false,
  );
  assert.deepEqual([...entries.keys()], ["active-a", "active-b"]);
});

void test("rejects invalid capacity parameters", () => {
  const entries = new Map<string, Entry>();

  assert.throws(
    () => reserveBoundedMapCapacity(entries, { ...options, maxEntries: 0 }),
    RangeError,
  );
  assert.throws(
    () =>
      reserveBoundedMapCapacity(entries, {
        ...options,
        incomingEntries: -1,
      }),
    RangeError,
  );
});
