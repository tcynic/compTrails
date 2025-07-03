declare module 'argon2-browser' {
  export interface HashOptions {
    pass: string;
    salt: Uint8Array;
    type: number; // 0 = Argon2d, 1 = Argon2i, 2 = Argon2id
    mem: number; // Memory usage in KB
    time: number; // Number of iterations
    parallelism: number; // Number of threads
    hashLen: number; // Hash length in bytes
  }

  export interface HashResult {
    hash: ArrayBuffer;
    hashHex: string;
    encoded: string;
  }

  export function hash(options: HashOptions): Promise<HashResult>;
}