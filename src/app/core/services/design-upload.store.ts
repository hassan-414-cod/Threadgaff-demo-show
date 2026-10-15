import { Injectable } from '@angular/core';

/** Largest design file the Private Label step accepts. */
export const DESIGN_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const DESIGN_UPLOAD_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'ai', 'zip'];
export const DESIGN_UPLOAD_ACCEPT = DESIGN_UPLOAD_EXTENSIONS.map((e) => `.${e}`).join(',');

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** True when the browser can draw the file on the garment preview. */
export function isPreviewableImage(file: File | null | undefined): boolean {
  if (!file) return false;
  if (/^image\/(png|jpe?g|webp|gif|svg\+xml)$/i.test(file.type)) return true;
  return /\.(png|jpe?g)$/i.test(file.name);
}

const DB_NAME = 'tg-design-draft';
const STORE = 'files';
const KEY_DESIGN = 'design';
const KEY_LOGO = 'logo';

/**
 * Keeps the customer's uploads (the Private Label design file and the Branding logo) so they
 * are saved with the design: they survive a page reload, come back in the designer preview and
 * are handed to the quote / enquiry page, where the design file becomes the digital proof.
 *
 * Files are kept in memory and mirrored to IndexedDB (localStorage is too small for 10 MB
 * files). If IndexedDB is unavailable the in-memory copy still works for the session.
 */
@Injectable({ providedIn: 'root' })
export class DesignUploadStore {
  private design: File | null = null;
  private logo: File | null = null;
  private db: Promise<IDBDatabase | null> | null = null;

  /** Returns an error message, or null when the file is acceptable. */
  validate(file: File): string | null {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!DESIGN_UPLOAD_EXTENSIONS.includes(ext)) {
      return 'Unsupported file type. Please upload a PDF, PNG, JPG, AI or ZIP file.';
    }
    if (file.size > DESIGN_UPLOAD_MAX_BYTES) {
      return `That file is ${formatFileSize(file.size)}. The limit is ${formatFileSize(DESIGN_UPLOAD_MAX_BYTES)}.`;
    }
    if (file.size === 0) return 'That file is empty.';
    return null;
  }

  /** Saves (or, with null, removes) the design file. */
  set(file: File | null): void {
    this.design = file;
    void this.write(KEY_DESIGN, file);
  }

  /** Saves (or, with null, removes) the Branding logo. */
  setLogo(file: File | null): void {
    this.logo = file;
    void this.write(KEY_LOGO, file);
  }

  /** The saved design file, from memory or from the browser's storage. */
  async restore(): Promise<File | null> {
    if (!this.design) this.design = await this.read(KEY_DESIGN);
    return this.design;
  }

  /** The saved logo, from memory or from the browser's storage. */
  async restoreLogo(): Promise<File | null> {
    if (!this.logo) this.logo = await this.read(KEY_LOGO);
    return this.logo;
  }

  /** Removes both uploads, e.g. once an enquiry has been sent. */
  clear(): void {
    this.set(null);
    this.setLogo(null);
  }

  private open(): Promise<IDBDatabase | null> {
    if (this.db) return this.db;
    this.db = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.db;
  }

  private async write(key: string, file: File | null): Promise<void> {
    const db = await this.open();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        if (file) tx.objectStore(STORE).put(file, key);
        else tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private async read(key: string): Promise<File | null> {
    const db = await this.open();
    if (!db) return null;
    return new Promise<File | null>((resolve) => {
      try {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        req.onsuccess = () => {
          const v = req.result;
          resolve(v instanceof Blob ? (v as File) : null);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
}
