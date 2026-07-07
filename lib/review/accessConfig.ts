import type { ReviewAccessConfig } from '@/lib/review/access';

export const reviewAccessConfig: ReviewAccessConfig = {
  masters: ['인디', '찰리'],
  staff: ['페리', '블루', '다야', '윈터', '리아'],
  sheetMap: {
    페리: { income: '종소세 25년 페리', corpCols: [29, 35] },
    블루: { income: '종소세 25년 블루', corpCols: [1, 7] },
    다야: { income: '종소세 25년 다야', corpCols: [8, 14] },
    윈터: { income: '종소세 25년 윈터', corpCols: [15, 21] },
    리아: { income: '종소세 25년 리아', corpCols: [22, 28] },
    인디: {},
  },
  corpSheet: '법인세(26.3)',
  corpTaxVersions: [{ id: '26.3', sheet: '법인세(26.3)' }],
  corpFeeSheet: '법인세 조정료25',
  incomeOrder: ['페리', '블루', '다야', '윈터', '리아', '인디'],
};
