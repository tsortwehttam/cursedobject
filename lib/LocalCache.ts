import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { Cache } from "./Cache";

export class LocalCache implements Cache {
  constructor(private cacheDir: string) {
    mkdirSync(this.cacheDir, { recursive: true });
  }

  async get(key: string): Promise<Buffer | null> {
    const path = join(this.cacheDir, key);
    return existsSync(path) ? readFileSync(path) : null;
  }

  async set(key: string, value: Buffer, contentType: string): Promise<string> {
    const path = join(this.cacheDir, key);
    const dir = dirname(path);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(path, value);
    return `file://${path}`;
  }
}
