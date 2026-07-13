import { describe, expect, it } from 'vitest';

import { TraceRecorder } from '../src/trace';

describe('TraceRecorder', () => {
  it('records a step as pending then completes it with a duration', async () => {
    const recorder = new TraceRecorder();

    const step = recorder.start('Consolidating via Universal Account');

    expect(step.status).toBe('active');
    expect(step.label).toBe('Consolidating via Universal Account');

    await new Promise((resolve) => setTimeout(resolve, 5));

    recorder.complete(step.id);
    const steps = recorder.steps;

    expect(steps).toHaveLength(1);
    expect(steps[0]?.status).toBe('complete');
    expect(steps[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('supports an optional badge and detail on a step', () => {
    const recorder = new TraceRecorder();
    const step = recorder.start('Signed via Magic', { badge: 'NO POPUP', detail: 'EIP-7702 blind signature' });

    recorder.complete(step.id);

    expect(recorder.steps[0]?.badge).toBe('NO POPUP');
    expect(recorder.steps[0]?.detail).toBe('EIP-7702 blind signature');
  });

  it('marks a step as error with a detail message', () => {
    const recorder = new TraceRecorder();
    const step = recorder.start('Routed to provider');

    recorder.fail(step.id, 'All providers returned an error');

    expect(recorder.steps[0]?.status).toBe('error');
    expect(recorder.steps[0]?.detail).toBe('All providers returned an error');
  });
});
