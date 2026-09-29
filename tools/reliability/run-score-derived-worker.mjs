#!/usr/bin/env node
// Supported long-lived internal worker. Starting/deploying it remains an explicit
// operator action; once running, pickup and recovery are autonomous.
import { runScoreDerivedWorker } from '../../lib/score-derived-worker.js';
import { createCurrentScoreDerivedDeliveryAdapter } from '../../lib/score-derived-delivery.js';
if (process.argv.length !== 2) throw new Error('DERIVED_WORKER_ACCEPTS_NO_TARGET_ARGUMENTS');
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => controller.abort());
const adapter = await createCurrentScoreDerivedDeliveryAdapter();
const result = await runScoreDerivedWorker({ ...adapter, signal: controller.signal,
  emit: event => process.stdout.write(JSON.stringify(event) + '\n') });
if (!result.ok) process.exitCode = 1;
