/**
 * Runs image uploads a few at a time instead of one by one. A job marked `exclusive` (one that
 * rewrites the product's colour rows) waits for the uploads already running, runs alone, and
 * lets the rest follow. Jobs start in the order they were added.
 */
export class UploadGate {
  private running = 0;
  private exclusiveRunning = false;
  private readonly queue: Array<{ exclusive: boolean; start: () => void }> = [];
  private idleWaiters: Array<() => void> = [];

  constructor(private readonly limit = 3) {}

  run<T>(job: () => Promise<T>, exclusive = false): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        exclusive,
        start: () => {
          Promise.resolve()
            .then(job)
            .then(resolve, reject)
            .finally(() => {
              this.running--;
              if (exclusive) this.exclusiveRunning = false;
              this.pump();
            });
        },
      });
      this.pump();
    });
  }

  /** Resolves once nothing is running or waiting. */
  idle(): Promise<void> {
    if (!this.running && !this.queue.length) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private pump() {
    while (this.queue.length && !this.exclusiveRunning) {
      const next = this.queue[0];
      if (next.exclusive ? this.running > 0 : this.running >= this.limit) break;
      this.queue.shift();
      this.running++;
      if (next.exclusive) this.exclusiveRunning = true;
      next.start();
    }
    if (!this.running && !this.queue.length) {
      this.idleWaiters.splice(0).forEach((resolve) => resolve());
    }
  }
}
