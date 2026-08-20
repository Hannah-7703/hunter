import type { VoiceFailureCode } from '@/lib/diagnostics';

// Only a fixed failure category is sent. Transcripts, device data, and browser errors stay local.
export function reportVoiceFailure(failureCode: VoiceFailureCode): void {
  void fetch('/api/client-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ failureCode }),
    keepalive: true,
  }).catch(() => undefined);
}
