import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env";

/**
 * File storage abstraction (confirmed decision: local disk in dev, behind an
 * interface so an S3-compatible provider is a config change at deploy time).
 * Keys look like "imports/<uuid>.xlsx" — no client-supplied path parts.
 */
export interface StorageProvider {
  save(prefix: string, extension: string, data: Buffer): Promise<string>;
  read(key: string): Promise<Buffer>;
}

const KEY_PATTERN = /^[a-z0-9_-]+\/[a-f0-9-]+\.[a-z0-9]+$/;

export class LocalDiskStorage implements StorageProvider {
  constructor(private readonly rootDir: string) {}

  async save(prefix: string, extension: string, data: Buffer): Promise<string> {
    const key = `${prefix}/${crypto.randomUUID()}.${extension.replace(/^\./, "")}`;
    if (!KEY_PATTERN.test(key)) throw new Error(`Invalid storage key: ${key}`);
    const fullPath = path.join(this.rootDir, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, data);
    return key;
  }

  async read(key: string): Promise<Buffer> {
    if (!KEY_PATTERN.test(key)) throw new Error(`Invalid storage key: ${key}`);
    return fs.readFile(path.join(this.rootDir, key));
  }
}

let provider: StorageProvider | undefined;

export function getStorage(): StorageProvider {
  if (!provider) {
    provider = new LocalDiskStorage(env.UPLOAD_DIR);
  }
  return provider;
}
