// 블루홀 감사 로그 표시용 라벨 (패널/관리자 페이지 공용)
import { CLIENT_SYNC_FIELDS } from '@/lib/bluehole/clientFieldMap';

export type BlueholeAction = 'create' | 'update' | 'link' | 'unlink';

export const ACTION_LABEL: Record<BlueholeAction, string> = {
  create: '생성',
  update: '수정',
  link: '연결',
  unlink: '해제',
};

export const ACTION_BADGE: Record<BlueholeAction, string> = {
  create: 'bg-violet-50 text-violet-700 border-violet-200',
  update: 'bg-blue-50 text-blue-700 border-blue-200',
  link: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  unlink: 'bg-slate-100 text-slate-600 border-slate-200',
};

const COL_LABEL: Record<string, string> = Object.fromEntries(
  CLIENT_SYNC_FIELDS.map((f) => [f.col, f.label]),
);

export function columnLabel(col: string): string {
  return COL_LABEL[col] || col;
}

export function actionLabel(action: string): string {
  return ACTION_LABEL[action as BlueholeAction] || action;
}

export function actionBadge(action: string): string {
  return ACTION_BADGE[action as BlueholeAction] || ACTION_BADGE.update;
}
