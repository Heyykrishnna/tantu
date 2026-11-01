import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { pollWhileVisible } from "../lib/visible-polling.ts";

class Visibility extends EventTarget {
  visibilityState = "visible";
  change(state: string) {
    this.visibilityState = state;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

test("polling waits for completion, pauses while hidden and refreshes on return", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const visibility = new Visibility();
  const calls: AbortSignal[] = [];
  let finish: () => void = () => {};
  const errors: unknown[] = [];
  const stop = pollWhileVisible(signal => {
    calls.push(signal);
    return new Promise<void>(resolve => { finish = resolve; });
  }, error => errors.push(error), visibility, { interval: 100 });
  context.mock.timers.tick(500);
  assert.equal(calls.length, 1);
  visibility.change("hidden");
  assert.equal(calls[0].aborted, true);
  finish();
  await setImmediate();
  context.mock.timers.tick(500);
  assert.equal(calls.length, 1);
  visibility.change("visible");
  assert.equal(calls.length, 2);
  finish();
  await setImmediate();
  context.mock.timers.tick(100);
  assert.equal(calls.length, 3);
  stop();
  assert.equal(calls[2].aborted, true);
  finish();
  await setImmediate();
  visibility.change("visible");
  context.mock.timers.tick(500);
  assert.equal(calls.length, 3);
  assert.deepEqual(errors, []);
});

test("hidden startup does no work and failures retry without overlapping", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const visibility = new Visibility();
  visibility.visibilityState = "hidden";
  let calls = 0;
  const errors: unknown[] = [];
  const failure = new Error("unavailable");
  const stop = pollWhileVisible(async () => { calls++; throw failure; }, error => errors.push(error), visibility, { interval: 100 });
  context.mock.timers.tick(500);
  assert.equal(calls, 0);
  visibility.change("visible");
  await setImmediate();
  assert.deepEqual(errors, [failure]);
  context.mock.timers.tick(100);
  await setImmediate();
  assert.equal(calls, 2);
  stop();
});
