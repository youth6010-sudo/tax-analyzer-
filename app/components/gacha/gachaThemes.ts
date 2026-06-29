export type GachaMachineVariant = 'arcade' | 'pastel';

export type GachaMachineTheme = {
  cabinetEmoji: string;
  cabinetTitle: string;
  ariaLabel: string;
  revealTag: string;
  revealSub: string;
  statusRevealPrefix: string;
  /** 외형 스킨. 미지정 시 arcade(기본 다크 아케이드). */
  variant?: GachaMachineVariant;
};

export const LUNCH_GACHA_THEME: GachaMachineTheme = {
  cabinetEmoji: '🍳',
  cabinetTitle: 'YUMMY LOTTO',
  ariaLabel: '점심 뽑기 머신',
  revealTag: '🍰 TODAY’S PICK',
  revealSub: '오늘 점심은 여기예요!',
  statusRevealPrefix: '🎀 오늘 점심 —',
  variant: 'pastel',
};

export const MANAGER_GACHA_THEME: GachaMachineTheme = {
  cabinetEmoji: '👤',
  cabinetTitle: 'STAFF LOTTO',
  ariaLabel: '담당자 로또 추첨기',
  revealTag: '🎯 PICKED',
  revealSub: '오늘의 담당자!',
  statusRevealPrefix: '🎉 당첨 —',
  variant: 'arcade',
};
