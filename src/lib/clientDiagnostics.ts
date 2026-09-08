import type { VoiceFailureCode } from '@/lib/diagnostics';

export type ProductEventName = 'mindmap_viewed' | 'mindmap_node_opened';

function sendClientEvent(body: Record<string, string>): void {
  void fetch('/api/client-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}

// Only a fixed failure category is sent. Transcripts, device data, and browser errors stay local.
export function reportVoiceFailure(failureCode: VoiceFailureCode): void {
  sendClientEvent({ failureCode });
}

// 仅记录允许的产品行为；不发送笔记、观点或情绪内容，且失败不会影响用户操作。
export function reportProductEvent(event: ProductEventName): void {
  sendClientEvent({ event });
}
