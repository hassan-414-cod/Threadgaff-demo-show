import { Injectable } from '@angular/core';

/** Largest design file the Private Label step accepts. */
export const DESIGN_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const DESIGN_UPLOAD_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'ai', 'zip'];
export const DESIGN_UPLOAD_ACCEPT = DESIGN_UPLOAD_EXTENSIONS.map((e) => `.${e}`).join(',');

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Hands the customer's design file (measurements + text) from the designer to the
 * quote / enquiry page, where it becomes the basis of the digital proof.
 * Held in memory only; read once.
 */
@Injectable({ providedIn: 'root' })
export class DesignUploadStore {
  private file: File | null = null;

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

  set(file: File | null): void {
    this.file = file;
  }

  /** Returns the stored file and clears it. */
  take(): File | null {
    const f = this.file;
    this.file = null;
    return f;
  }
}
