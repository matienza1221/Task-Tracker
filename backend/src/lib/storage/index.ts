import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env';
import { AppError } from '../errors';

export interface StorageProvider {
  readonly kind: 'local' | 's3';
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

const SAFE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,200}$/;

function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.includes('..') || key.startsWith('/') || key.includes('//')) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid storage key.');
  }
}

/**
 * Local filesystem storage for development. Keys are always server-generated
 * (`<projectId>/<uuid><ext>`), resolved under the upload root and verified to
 * stay inside it — user-supplied paths are never used.
 */
class LocalStorageProvider implements StorageProvider {
  readonly kind = 'local' as const;
  private readonly root = path.resolve(env.UPLOAD_DIR);

  private resolve(key: string): string {
    assertSafeKey(key);
    const target = path.resolve(this.root, key);
    if (target !== this.root && !target.startsWith(`${this.root}${path.sep}`)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid storage key.');
    }
    return target;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data, { mode: 0o600 });
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

class UnconfiguredStorageProvider implements StorageProvider {
  readonly kind = 's3' as const;
  private fail(): never {
    throw new AppError(500, 'INTERNAL_ERROR', 'The configured storage provider is not available.');
  }
  async put(): Promise<void> {
    this.fail();
  }
  async get(): Promise<Buffer> {
    this.fail();
  }
  async delete(): Promise<void> {
    this.fail();
  }
}

let provider: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (provider) return provider;
  provider = env.STORAGE_PROVIDER === 'local' ? new LocalStorageProvider() : new UnconfiguredStorageProvider();
  return provider;
}
