/** contentEditable 서식 — 선택 영역 기준 */

export const NOTICE_FONT_SIZES = [
  { label: '작게', px: '12px' },
  { label: '보통', px: '14px' },
  { label: '크게', px: '16px' },
  { label: '더크게', px: '18px' },
  { label: '제목', px: '22px' },
] as const;

export const NOTICE_TEXT_COLORS = [
  { label: '검정', value: '#111827' },
  { label: '남색', value: '#002D62' },
  { label: '파랑', value: '#1d4ed8' },
  { label: '빨강', value: '#b91c1c' },
  { label: '초록', value: '#15803d' },
  { label: '회색', value: '#64748b' },
  { label: '금색', value: '#C5A059' },
] as const;

function selectionInside(root: HTMLElement | null): boolean {
  if (!root) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const node = sel.anchorNode;
  if (!node) return false;
  return root.contains(node.nodeType === Node.TEXT_NODE ? node.parentNode : node);
}

/** 툴바 클릭 후에도 선택 유지 */
export function focusEditorKeepSelection(root: HTMLElement | null) {
  if (!root) return;
  root.focus();
}

export function runBold(root: HTMLElement | null) {
  if (!root || !selectionInside(root)) return;
  focusEditorKeepSelection(root);
  document.execCommand('bold', false);
}

export function runItalic(root: HTMLElement | null) {
  if (!root || !selectionInside(root)) return;
  focusEditorKeepSelection(root);
  document.execCommand('italic', false);
}

export function runUnderline(root: HTMLElement | null) {
  if (!root || !selectionInside(root)) return;
  focusEditorKeepSelection(root);
  document.execCommand('underline', false);
}

/** 글자 크기 — span style로 적용 (execCommand fontSize는 1~7만 지원) */
export function runFontSize(root: HTMLElement | null, px: string) {
  if (!root || !selectionInside(root)) return;
  focusEditorKeepSelection(root);
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

  const range = sel.getRangeAt(0);
  const span = document.createElement('span');
  span.style.fontSize = px;
  try {
    range.surroundContents(span);
  } catch {
    // 부분 교차 시 extract → wrap
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
  sel.removeAllRanges();
  const next = document.createRange();
  next.selectNodeContents(span);
  sel.addRange(next);
}

export function runForeColor(root: HTMLElement | null, color: string) {
  if (!root || !selectionInside(root)) return;
  focusEditorKeepSelection(root);
  document.execCommand('styleWithCSS', false, 'true');
  document.execCommand('foreColor', false, color);
}

export function runUndo(root: HTMLElement | null) {
  if (!root) return;
  focusEditorKeepSelection(root);
  document.execCommand('undo', false);
}

export function runRedo(root: HTMLElement | null) {
  if (!root) return;
  focusEditorKeepSelection(root);
  document.execCommand('redo', false);
}

/** 공문 붙여넣기 — 배경만 제거하고 굵게·색·크기는 유지 */
export function prepareOfficialLetterPasteContent(html: string, plain: string): string {
  if (typeof document === 'undefined') {
    return (plain || html || '').replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
  }

  const root = document.createElement('div');
  const trimmed = html?.trim().replace(/<!--[\s\S]*?-->/g, '');
  if (trimmed) {
    root.innerHTML = trimmed;
  } else {
    root.innerHTML = (plain || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\r\n/g, '\n')
      .replace(/\n/g, '<br>');
  }

  root.querySelectorAll('script,style,meta,link,title').forEach(el => el.remove());
  root.querySelectorAll('*').forEach(node => {
    const el = node as HTMLElement;
    el.removeAttribute('onerror');
    el.removeAttribute('onload');
    el.removeAttribute('onclick');
    if (!el.style) return;
    el.style.removeProperty('background');
    el.style.removeProperty('background-color');
    el.style.removeProperty('background-image');
  });

  return root.innerHTML.trim();
}
