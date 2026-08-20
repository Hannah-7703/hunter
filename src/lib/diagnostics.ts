export const VOICE_FAILURE_CODES = [
  'VOICE_ABORTED',
  'VOICE_NO_SPEECH',
  'VOICE_PERMISSION_DENIED',
  'VOICE_MIC_UNAVAILABLE',
  'VOICE_NETWORK',
  'VOICE_SERVICE_UNAVAILABLE',
  'VOICE_LANGUAGE_UNSUPPORTED',
  'VOICE_UNKNOWN',
] as const;

export type VoiceFailureCode = typeof VOICE_FAILURE_CODES[number];

export const AI_FAILURE_CODES = [
  'AI_CONFIG_MISSING',
  'AI_UPSTREAM_HTTP',
  'AI_TIMEOUT',
  'AI_NETWORK',
  'AI_EMPTY_RESPONSE',
  'AI_INVALID_RESPONSE',
  'AI_UNKNOWN',
] as const;

export type AiFailureCode = typeof AI_FAILURE_CODES[number];

export type FailureCode = VoiceFailureCode | AiFailureCode | 'SESSION_INVALID' | 'NOTE_SAVE_FAILED';

export interface VoiceFailure {
  code: VoiceFailureCode;
  message: string;
}

export function classifyVoiceFailure(error: string | undefined): VoiceFailure | null {
  switch (error) {
    case 'aborted':
      return { code: 'VOICE_ABORTED', message: '语音识别已中断，请重新开始录音' };
    case 'no-speech':
      return { code: 'VOICE_NO_SPEECH', message: '没有检测到清晰声音，请靠近麦克风后重试' };
    case 'not-allowed':
      return { code: 'VOICE_PERMISSION_DENIED', message: '麦克风权限未开启，请允许后重试' };
    case 'audio-capture':
      return { code: 'VOICE_MIC_UNAVAILABLE', message: '未检测到可用麦克风，请检查设备后重试' };
    case 'network':
      return { code: 'VOICE_NETWORK', message: '语音服务网络异常，请改为文字输入或稍后重试' };
    case 'service-not-allowed':
      return { code: 'VOICE_SERVICE_UNAVAILABLE', message: '当前浏览器的语音服务不可用，请改为文字输入' };
    case 'language-not-supported':
      return { code: 'VOICE_LANGUAGE_UNSUPPORTED', message: '当前浏览器不支持中文语音识别，请改为文字输入' };
    default:
      return { code: 'VOICE_UNKNOWN', message: '语音识别暂时不可用，请改为文字输入或稍后重试' };
  }
}

export function isVoiceFailureCode(value: unknown): value is VoiceFailureCode {
  return typeof value === 'string' && (VOICE_FAILURE_CODES as readonly string[]).includes(value);
}
