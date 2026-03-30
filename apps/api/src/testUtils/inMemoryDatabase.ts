import { ObjectId } from "mongodb";
import type {
  ApprovalDoc,
  AuditEventDoc,
  Database,
  DatabaseCollections,
  MessageDoc,
  PluginExecutionHistoryDoc,
  PluginInstallationDoc,
  ProjectDoc,
  RunCheckpointDoc,
  RunDoc,
  SessionDoc,
  UserDoc
} from "../db.js";

type SortDirection = 1 | -1;
type QueryValue = unknown;

interface QueryCondition {
  $in?: QueryValue[];
}

type Query<T> = Partial<Record<keyof T, QueryValue | QueryCondition>>;

class InMemoryCursor<T extends { _id?: ObjectId }> {
  constructor(private readonly items: T[]) {}

  sort(sortSpec: Partial<Record<keyof T, SortDirection>>): InMemoryCursor<T> {
    const entries = Object.entries(sortSpec) as Array<[keyof T, SortDirection]>;
    this.items.sort((left, right) => {
      for (const [field, direction] of entries) {
        const leftValue = left[field];
        const rightValue = right[field];

        if (leftValue === rightValue) {
          continue;
        }

        const normalized =
          leftValue instanceof Date && rightValue instanceof Date
            ? leftValue.getTime() - rightValue.getTime()
            : String(leftValue).localeCompare(String(rightValue));

        if (normalized !== 0) {
          return normalized * direction;
        }
      }

      return 0;
    });

    return this;
  }

  limit(value: number): InMemoryCursor<T> {
    return new InMemoryCursor(this.items.slice(0, value));
  }

  async toArray(): Promise<T[]> {
    return [...this.items];
  }
}

class InMemoryCollection<T extends { _id?: ObjectId }> {
  private readonly items: T[] = [];

  async createIndex(): Promise<string> {
    return "ok";
  }

  async findOne(query: Query<T>): Promise<T | null> {
    return this.items.find((item) => matchesQuery(item, query)) ?? null;
  }

  find(query: Query<T>): InMemoryCursor<T> {
    return new InMemoryCursor(this.items.filter((item) => matchesQuery(item, query)));
  }

  async insertOne(doc: T): Promise<{ insertedId: ObjectId }> {
    const stored = { ...doc, _id: doc._id ?? new ObjectId() } as T;
    this.items.push(stored);
    return { insertedId: stored._id! };
  }

  async updateOne(
    query: Query<T>,
    update: { $set?: Partial<T>; $unset?: Partial<Record<keyof T, "" | 1 | true>> }
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    const item = this.items.find((entry) => matchesQuery(entry, query));
    if (!item) {
      return { matchedCount: 0, modifiedCount: 0 };
    }

    applyUpdate(item, update);
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async updateMany(
    query: Query<T>,
    update: { $set?: Partial<T>; $unset?: Partial<Record<keyof T, "" | 1 | true>> }
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    const matches = this.items.filter((item) => matchesQuery(item, query));
    for (const item of matches) {
      applyUpdate(item, update);
    }

    return {
      matchedCount: matches.length,
      modifiedCount: matches.length
    };
  }

  async deleteOne(query: Query<T>): Promise<{ deletedCount: number }> {
    const index = this.items.findIndex((item) => matchesQuery(item, query));
    if (index === -1) {
      return { deletedCount: 0 };
    }

    this.items.splice(index, 1);
    return { deletedCount: 1 };
  }

  async countDocuments(query: Query<T>): Promise<number> {
    return this.items.filter((item) => matchesQuery(item, query)).length;
  }
}

function applyUpdate<T extends object>(
  item: T,
  update: { $set?: Partial<T>; $unset?: Partial<Record<keyof T, "" | 1 | true>> }
): void {
  if (update.$set) {
    Object.assign(item, update.$set);
  }

  if (update.$unset) {
    for (const field of Object.keys(update.$unset) as Array<keyof T>) {
      delete item[field];
    }
  }
}

function equalsValue(left: QueryValue, right: QueryValue): boolean {
  if (left instanceof ObjectId && right instanceof ObjectId) {
    return left.equals(right);
  }

  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }

  return left === right;
}

function isCondition(value: QueryValue): value is QueryCondition {
  return typeof value === "object" && value !== null && "$in" in value;
}

function matchesQuery<T extends { _id?: ObjectId }>(item: T, query: Query<T>): boolean {
  return Object.entries(query).every(([field, expected]) => {
    const actual = item[field as keyof T];
    if (isCondition(expected)) {
      return (expected.$in ?? []).some((value) => equalsValue(actual, value));
    }

    return equalsValue(actual, expected);
  });
}

export function createInMemoryDatabase(): Database {
  const collections: DatabaseCollections = {
    users: new InMemoryCollection<UserDoc>() as never,
    projects: new InMemoryCollection<ProjectDoc>() as never,
    sessions: new InMemoryCollection<SessionDoc>() as never,
    messages: new InMemoryCollection<MessageDoc>() as never,
    runs: new InMemoryCollection<RunDoc>() as never,
    approvals: new InMemoryCollection<ApprovalDoc>() as never,
    auditEvents: new InMemoryCollection<AuditEventDoc>() as never,
    runCheckpoints: new InMemoryCollection<RunCheckpointDoc>() as never,
    pluginInstallations: new InMemoryCollection<PluginInstallationDoc>() as never,
    pluginExecutionHistory: new InMemoryCollection<PluginExecutionHistoryDoc>() as never
  };

  return {
    client: {
      close: async () => undefined
    } as never,
    collections
  };
}
