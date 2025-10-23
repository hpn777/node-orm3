export type QueueCallback = (err?: Error | null) => void;

export class Queue {
  private pending = 0;

  constructor(private readonly cb: QueueCallback) {}

  add(...args: any[]): this {
    if (this.pending === -1) {
      return this;
    }

    this.pending += 1;

    const task = args.pop();

    if (typeof task !== "function") {
      throw new TypeError("Queue.add() requires a function as the last argument");
    }

    const wrappedCallback = (err?: Error | null): void => {
      if (this.pending === -1) {
        return;
      }

      if (err) {
        this.pending = -1;
        this.cb(err);
        return;
      }

      if (--this.pending === 0) {
        this.cb();
      }
    };

    task(...args, wrappedCallback);

    return this;
  }

  check(): void {
    if (this.pending === 0) {
      this.cb();
    }
  }
}

export default Queue;
