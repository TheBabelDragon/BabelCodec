/**
 * Multi-file conversion queue with isolation and bounded concurrency.
 */

export function createBatchQueue(max = 32) {
  /** @type {Array<{ id: string, name: string, bytes: Uint8Array, status: string, error?: string, resultBlob?: Blob, resultName?: string }>} */
  const items = [];
  return {
    items,
    max,
    add(name, bytes) {
      if (items.length >= max) {
        throw new Error(`Queue limit ${max} reached`);
      }
      const item = {
        id: 'b_' + Math.random().toString(36).slice(2, 10),
        name,
        bytes,
        status: 'queued',
      };
      items.push(item);
      return item;
    },
    remove(id) {
      const i = items.findIndex((x) => x.id === id);
      if (i >= 0) items.splice(i, 1);
    },
    clear() {
      items.length = 0;
    },
  };
}

export async function processQueue(items, worker, opts = {}) {
  const concurrency = Math.max(1, opts.concurrency || 2);
  let idx = 0;
  async function run() {
    while (idx < items.length) {
      if (opts.signal?.aborted) return;
      const i = idx++;
      const item = items[i];
      if (!item) return;
      item.status = 'processing';
      try {
        await worker(item);
        if (item.status === 'processing') item.status = 'done';
      } catch (e) {
        item.status = 'error';
        item.error = e?.message || String(e);
      }
    }
  }
  const runners = [];
  for (let c = 0; c < concurrency; c++) runners.push(run());
  await Promise.all(runners);
}
