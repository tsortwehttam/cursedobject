export interface Cache {
  get(key: string): Promise<Buffer | null>;
  set(key: string, value: Buffer, contentType: string): Promise<string>;
}