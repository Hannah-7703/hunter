import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startRecognition } from '@/lib/recorder';

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  interimResults = false;
  continuous = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: (() => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();

  constructor() {
    FakeRecognition.instances.push(this);
  }

  result(text: string, isFinal = true) {
    this.onresult?.({
      resultIndex: 0,
      results: [{ 0: { transcript: text }, isFinal }],
    });
  }

  end() {
    this.onend?.();
  }
}

describe('speech recognition pause and resume', () => {
  beforeEach(() => {
    FakeRecognition.instances = [];
    vi.stubGlobal('window', { SpeechRecognition: FakeRecognition });
  });

  it('keeps text from separate recognition instances that both use result index zero', async () => {
    const controller = startRecognition('zh-CN', {
      onResult: vi.fn(), onError: vi.fn(), onSilence: vi.fn(), onMaxDuration: vi.fn(),
    });
    const first = FakeRecognition.instances[0];
    first.result('暂停前内容');

    controller.pause();
    controller.resume();
    expect(FakeRecognition.instances).toHaveLength(1);

    first.end();
    const second = FakeRecognition.instances[1];
    second.result('恢复后内容');

    const stopped = controller.stop();
    second.end();
    await expect(stopped).resolves.toBe('暂停前内容恢复后内容');
  });

  it('submits text captured before pausing when stopped while paused', async () => {
    const controller = startRecognition('zh-CN', {
      onResult: vi.fn(), onError: vi.fn(), onSilence: vi.fn(), onMaxDuration: vi.fn(),
    });
    const first = FakeRecognition.instances[0];
    first.result('暂停前内容');

    controller.pause();
    const stopped = controller.stop();
    first.end();

    await expect(stopped).resolves.toBe('暂停前内容');
  });
});
