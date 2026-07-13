export type TraceStepStatus = 'pending' | 'active' | 'complete' | 'error';

export interface TraceStep {
  id: string;
  label: string;
  status: TraceStepStatus;
  durationMs?: number;
  badge?: string;
  detail?: string;
}

export interface TraceRecorderPort {
  readonly steps: TraceStep[];
  start(label: string, options?: { badge?: string; detail?: string }): TraceStep;
  complete(stepId: string): void;
  fail(stepId: string, detail: string): void;
}

export class TraceRecorder implements TraceRecorderPort {
  private readonly stepList: TraceStep[] = [];
  private readonly startedAt = new Map<string, number>();

  get steps(): TraceStep[] {
    return [...this.stepList];
  }

  start(label: string, options: { badge?: string; detail?: string } = {}): TraceStep {
    const id = globalThis.crypto.randomUUID();
    const step: TraceStep = {
      id,
      label,
      status: 'active',
      ...(options.badge ? { badge: options.badge } : {}),
      ...(options.detail ? { detail: options.detail } : {}),
    };

    this.stepList.push(step);
    this.startedAt.set(id, Date.now());

    return step;
  }

  complete(stepId: string): void {
    this.setTerminal(stepId, 'complete');
  }

  fail(stepId: string, detail: string): void {
    this.setTerminal(stepId, 'error', detail);
  }

  private setTerminal(stepId: string, status: 'complete' | 'error', detail?: string): void {
    const step = this.stepList.find((entry) => entry.id === stepId);

    if (!step) {
      return;
    }

    const startedAt = this.startedAt.get(stepId) ?? Date.now();

    step.status = status;
    step.durationMs = Date.now() - startedAt;

    if (detail) {
      step.detail = detail;
    }
  }
}
