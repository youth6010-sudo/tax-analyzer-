export type GachaMachineTheme = {
  cabinetEmoji: string;
  cabinetTitle: string;
  ariaLabel: string;
  revealTag: string;
  revealSub: string;
  statusRevealPrefix: string;
};

export const LUNCH_GACHA_THEME: GachaMachineTheme = {
  cabinetEmoji: '🍱',
  cabinetTitle: 'LUNCH LOTTO',
  ariaLabel: '점심 로또 추첨기',
  revealTag: "🍽️ TODAY'S LUNCH",
  revealSub: '오늘 점심은 여기!',
  statusRevealPrefix: '🎉 오늘 점심 —',
};

export const MANAGER_GACHA_THEME: GachaMachineTheme = {
  cabinetEmoji: '👤',
  cabinetTitle: 'STAFF LOTTO',
  ariaLabel: '담당자 로또 추첨기',
  revealTag: '🎯 PICKED',
  revealSub: '오늘의 담당자!',
  statusRevealPrefix: '🎉 당첨 —',
};
