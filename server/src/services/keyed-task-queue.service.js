class KeyedTaskQueue {
  constructor({ concurrency = 10, maxPending = 10000, taskTimeoutMs = 0 } = {}) {
    this.concurrency = Math.max(1, Number(concurrency) || 1);
    this.maxPending = Math.max(this.concurrency, Number(maxPending) || this.concurrency);
    this.taskTimeoutMs = Math.max(0, Number(taskTimeoutMs) || 0);
    this.queues = new Map();
    this.readyKeys = [];
    this.readySet = new Set();
    this.activeKeys = new Set();
    this.activeCount = 0;
    this.pendingCount = 0;
  }

  whenIdle(timeoutMs = 5000) {
    if (this.activeCount === 0 && this.pendingCount === 0) return Promise.resolve();
    const limit = Math.max(0, Number(timeoutMs) || 0);
    return new Promise(resolve => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if ((this.activeCount === 0 && this.pendingCount === 0) || Date.now() - startedAt >= limit) {
          clearInterval(timer);
          resolve();
        }
      }, 50);
      timer.unref?.();
    });
  }

  enqueue(key, task) {
    if (typeof task !== 'function') return Promise.reject(new TypeError('A tarefa deve ser uma função.'));
    if (this.pendingCount >= this.maxPending) {
      return Promise.reject(new Error(`Fila de mensagens cheia (${this.maxPending} pendentes).`));
    }

    const normalizedKey = String(key || 'default');
    return new Promise((resolve, reject) => {
      const queue = this.queues.get(normalizedKey) || [];
      queue.push({ task, resolve, reject });
      this.queues.set(normalizedKey, queue);
      this.pendingCount += 1;
      this.markReady(normalizedKey);
      this.drain();
    });
  }

  markReady(key) {
    if (this.activeKeys.has(key) || this.readySet.has(key)) return;
    this.readySet.add(key);
    this.readyKeys.push(key);
  }

  drain() {
    while (this.activeCount < this.concurrency && this.readyKeys.length > 0) {
      const key = this.readyKeys.shift();
      this.readySet.delete(key);
      const queue = this.queues.get(key);
      if (!queue?.length || this.activeKeys.has(key)) continue;

      const item = queue.shift();
      this.activeKeys.add(key);
      this.activeCount += 1;

      const execution = Promise.resolve().then(item.task);
      let timeoutId;
      const guarded = this.taskTimeoutMs > 0
        ? new Promise((resolve, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`Tarefa da fila excedeu ${this.taskTimeoutMs}ms.`)), this.taskTimeoutMs);
          timeoutId.unref?.();
          execution.then(value => {
            clearTimeout(timeoutId);
            resolve(value);
          }, error => {
            clearTimeout(timeoutId);
            reject(error);
          });
        })
        : execution;
      if (this.taskTimeoutMs > 0) execution.catch(() => {});

      guarded
        .then(item.resolve, item.reject)
        .finally(() => {
          clearTimeout(timeoutId);
          this.activeKeys.delete(key);
          this.activeCount -= 1;
          this.pendingCount -= 1;
          if (queue.length > 0) this.markReady(key);
          else this.queues.delete(key);
          this.drain();
        });
    }
  }

  stats() {
    return {
      active: this.activeCount,
      pending: this.pendingCount,
      clients: this.queues.size,
      concurrency: this.concurrency,
      maxPending: this.maxPending
    };
  }
}

module.exports = KeyedTaskQueue;
