import type { Note } from '@/shared/types';

const WINDOWS_RESERVED = /^(CON|NUL|PRN|AUX|COM[1-9]|LPT[1-9])$/i;

function sanitizeFilename(title: string, dateStr: string): string {
  let safe = title.replace(/[\/\\:*?"<>|]/g, '_');
  if (WINDOWS_RESERVED.test(safe)) safe = '_' + safe;
  safe = safe.slice(0, 80);
  if (!safe.trim()) safe = '未命名笔记';
  return `${dateStr}_${safe}.md`;
}

function formatLocalDate(isoString: string): string {
  const d = new Date(isoString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatCreatedAt(isoString: string): string {
  const d = new Date(isoString);
  const y = d.getFullYear();
  const M = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y} 年 ${M} 月 ${day} 日 ${hh}:${mm}`;
}

export function buildMarkdown(note: Note): string {
  const source = note.fromVoice ? '🎤 语音' : '✏️ 文字';
  const dateStr = formatCreatedAt(note.createdAt);
  const durationStr = note.audioDuration ? `  ·  ${note.audioDuration}` : '';

  let md = `# ${note.title}\n\n`;
  md += `> ${source}  ·  ${dateStr}${durationStr}\n\n`;
  md += `---\n\n`;
  md += `## 原文\n\n${note.original}\n\n`;
  md += `---\n\n`;
  md += `## 提炼观点\n\n`;

  for (const kp of note.keyPoints) {
    md += `- **${kp.summary}**：${kp.detail}\n`;
  }

  md += `\n---\n\n`;
  md += `## 深度分析\n\n`;

  const dt = note.deepThinking;
  const tabs: { key: keyof typeof dt; title: string }[] = [
    { key: 'breakdown', title: '拆解' },
    { key: 'expand', title: '拓展' },
    { key: 'question', title: '拷问' },
  ];

  for (const tab of tabs) {
    const items = dt[tab.key];
    if (!items || items.length === 0) continue;
    md += `### ${tab.title}\n\n`;
    for (const item of items) {
      md += `- **${item.summary}**：${item.detail}\n`;
    }
    md += '\n';
  }

  return md;
}

export function downloadMarkdown(note: Note): void {
  const md = buildMarkdown(note);
  const dateStr = formatLocalDate(note.createdAt);
  const filename = sanitizeFilename(note.title, dateStr);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
