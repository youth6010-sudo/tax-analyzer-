/** 외부 시스템 등록 화면 URL (온보딩 보드용) */

export const EXTERNAL_SYSTEMS = {
  tp: {
    id: 'tp',
    label: 'TP',
    checklistKey: 'tpClient',
    href: null as string | null,
    copyHint: '아래 등록 패키지를 복사해 TP 거래처 등록 화면에 붙여넣으세요.',
  },
  semorang: {
    id: 'semorang',
    label: '세무사랑',
    checklistKey: 'programClient',
    href: null as string | null,
    copyHint: '더존/세무사랑 거래처 생성 화면에서 등록하세요.',
  },
  wemembers: {
    id: 'wemembers',
    label: '위멤버스·세모',
    checklistKey: 'semoReport',
    href: null as string | null,
    copyHint: '위멤버스 및 세모리포트 등록 화면에서 등록하세요.',
  },
  portal: {
    id: 'portal',
    label: '포털 수임처',
    checklistKey: null,
    href: '/clients/intake',
    copyHint: '포털에서 수임처 등록을 완료하세요.',
  },
} as const;

export type ExternalSystemId = keyof typeof EXTERNAL_SYSTEMS;
