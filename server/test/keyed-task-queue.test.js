const test = require('node:test');
const assert = require('node:assert/strict');
const KeyedTaskQueue = require('../src/services/keyed-task-queue.service');

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

test('preserva a ordem e impede sobreposição para o mesmo cliente', async () => {
  const queue = new KeyedTaskQueue({ concurrency: 4 });
  const events = [];
  let running = 0;
  let maximumRunning = 0;

  const tasks = [1, 2, 3].map(number => queue.enqueue('cliente-1', async () => {
    running += 1;
    maximumRunning = Math.max(maximumRunning, running);
    events.push(`start-${number}`);
    await wait(5);
    events.push(`end-${number}`);
    running -= 1;
  }));

  await Promise.all(tasks);
  assert.equal(maximumRunning, 1);
  assert.deepEqual(events, ['start-1', 'end-1', 'start-2', 'end-2', 'start-3', 'end-3']);
});

test('processa clientes diferentes em paralelo até o limite configurado', async () => {
  const queue = new KeyedTaskQueue({ concurrency: 3 });
  let running = 0;
  let maximumRunning = 0;

  await Promise.all(['a', 'b', 'c', 'd'].map(key => queue.enqueue(key, async () => {
    running += 1;
    maximumRunning = Math.max(maximumRunning, running);
    await wait(10);
    running -= 1;
  })));

  assert.equal(maximumRunning, 3);
  assert.deepEqual(queue.stats(), { active: 0, pending: 0, clients: 0, concurrency: 3, maxPending: 10000 });
});

test('libera o slot quando a tarefa passa do tempo limite', async () => {
  const queue = new KeyedTaskQueue({ concurrency: 1, taskTimeoutMs: 30 });
  let releaseHang = () => {};
  const hanging = queue.enqueue('cliente', () => new Promise(resolve => { releaseHang = resolve; }));
  await assert.rejects(hanging, /excedeu 30ms/);
  assert.equal(await queue.enqueue('outro', async () => 'ok'), 'ok');
  await wait(20);
  assert.equal(queue.stats().active, 0);
  releaseHang();
});

test('recusa novas tarefas ao atingir o limite de pendências', async () => {
  const queue = new KeyedTaskQueue({ concurrency: 1, maxPending: 2 });
  let release;
  const blocker = new Promise(resolve => { release = resolve; });
  const first = queue.enqueue('a', () => blocker);
  const second = queue.enqueue('a', async () => {});

  await assert.rejects(queue.enqueue('b', async () => {}), /Fila de mensagens cheia/);
  release();
  await Promise.all([first, second]);
});
