/* eslint-disable @typescript-eslint/no-explicit-any */

interface RecognitionCallbacks {
  onResult: (text: string) => void;
  onError: (error: string) => void;
  onSilence: () => void;
  onMaxDuration: (text: string) => void;
}

interface RecognitionController {
  stop: () => Promise<string>;
  pause: () => void;
  resume: () => void;
}

export function startRecognition(
  lang: string,
  callbacks: RecognitionCallbacks,
): RecognitionController {
  const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    callbacks.onError('浏览器不支持语音识别');
    return { stop: async () => '', pause() {}, resume() {} };
  }

  interface RecognitionSegment {
    finalResults: Map<number, string>;
    interimResults: Map<number, string>;
  }

  const segments: RecognitionSegment[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let elapsedSeconds = 0;
  let isPaused = false;
  let resumeRequested = false;
  let stopped = false;
  let stopPromise: Promise<string> | null = null;
  let resolveStop: ((transcript: string) => void) | null = null;
  let stopFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let activeRecognition: any = null;

  function getTranscript(): string {
    return segments
      .map(segment => {
        const results = new Map(segment.finalResults);
        for (const [index, text] of segment.interimResults) {
          results.set(index, text);
        }
        return [...results.entries()]
          .sort(([left], [right]) => left - right)
          .map(([, text]) => text)
          .join('');
      })
      .join('')
      .trim();
  }

  function finishStop() {
    if (stopFallbackTimer) {
      clearTimeout(stopFallbackTimer);
      stopFallbackTimer = null;
    }
    if (!resolveStop) return;
    const resolve = resolveStop;
    resolveStop = null;
    resolve(getTranscript());
  }

  function stopInternal() {
    if (stopped) return;
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    try {
      activeRecognition?.stop();
    } catch {
      finishStop();
    }
  }

  function startInstance() {
    if (stopped) return;
    const instance = new SpeechRecognitionClass();
    const segment: RecognitionSegment = {
      finalResults: new Map(),
      interimResults: new Map(),
    };
    segments.push(segment);
    activeRecognition = instance;
    instance.lang = lang;
    instance.interimResults = true;
    instance.continuous = true;

    instance.onresult = (event: any) => {
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          segment.finalResults.set(index, text);
          segment.interimResults.delete(index);
        } else {
          segment.interimResults.set(index, text);
        }
      }
      callbacks.onResult(getTranscript());
    };

    instance.onerror = () => {
      if (!stopped) callbacks.onError('语音识别出错，请稍后重试');
    };

    instance.onend = () => {
      if (activeRecognition === instance) activeRecognition = null;
      if (stopped) {
        finishStop();
        return;
      }
      if (resumeRequested) {
        resumeRequested = false;
        isPaused = false;
        startInstance();
      }
    };

    instance.start();

    timer = setInterval(() => {
      if (!isPaused) {
        elapsedSeconds++;
        if (elapsedSeconds >= 300) {
          stopInternal();
          callbacks.onMaxDuration(getTranscript());
        }
      }
    }, 1000);
  }

  startInstance();

  return {
    stop() {
      if (stopPromise) return stopPromise;
      if (stopped) return Promise.resolve(getTranscript());

      stopPromise = new Promise(resolve => {
        resolveStop = resolve;
        stopInternal();
        stopFallbackTimer = setTimeout(finishStop, 1500);
      });
      return stopPromise;
    },
    pause() {
      if (stopped || isPaused) return;
      isPaused = true;
      if (timer) { clearInterval(timer); timer = null; }
      try { activeRecognition?.stop(); } catch { /* ignore */ }
    },
    resume() {
      if (stopped || !isPaused) return;
      resumeRequested = true;
      if (!activeRecognition) {
        resumeRequested = false;
        isPaused = false;
        startInstance();
      }
    },
  };
}
