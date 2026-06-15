import type { ChurnFormValues } from '@/app/components/churn/ChurnRegisterForm';

export type ChurnExampleField = keyof Pick<
  ChurnFormValues,
  'earlySign' | 'reason' | 'churnType' | 'dataCleanup' | 'detail'
>;

export type ChurnExample = {
  id: string;
  field: ChurnExampleField;
  label: string;
  text: string;
};

export const CHURN_FIELD_LABELS: Record<ChurnExampleField, string> = {
  earlySign: '전조증상',
  reason: '유출 사유',
  churnType: '유형',
  dataCleanup: '자료 정리',
  detail: '상세 메모',
};

/** 유출 등록·수정 시 참고할 입력 예시 */
export const CHURN_EXAMPLES: ChurnExample[] = [
  {
    id: 'early-1',
    field: 'earlySign',
    label: '연락·불만',
    text: '1. 연락 빈도 하락\n2. 대표님의 불만족 표출',
  },
  {
    id: 'reason-1',
    field: 'reason',
    label: '타 서비스·관리 미흡',
    text: '1. 다른 서비스를 찾음(모든것을 스크레핑 후 확인 할 수 있는 서비스)\n2. 집중 관리 미흡 (내부 관리자기 있는경우 관리의 중요성이 올라감)',
  },
  {
    id: 'type-1',
    field: 'churnType',
    label: '확인 불가',
    text: '1. 확인 불가',
  },
  {
    id: 'reason-2',
    field: 'reason',
    label: '경영악화',
    text: '1. 경영악화로 인해 서비스 유지 X',
  },
  {
    id: 'detail-1',
    field: 'detail',
    label: '경리 협조·합병·사업자단위',
    text: '1. 기존 경리직원이 업무 협조하여 함께 진행하기로 하였으나 너무 바빠서 협조가 잘 이루어지지 않음.\n2. 회사 환경 자체가 불안정한 요인이 있었음/ 합병 등 목전에 두고 정리가 안됨\n3. 사업자단위 과세를 진행하는곳으로 지점이 많은데 프로젝트 구분이나 이런부분들이 원할하지 않았음',
  },
  {
    id: 'detail-2',
    field: 'detail',
    label: '합병 무산·자금경색',
    text: '1. 경리직원 2명이 너무바빠서 업무분장 협의 한 대로 진행이 되질 않음.\n2. 합병관련하여 미팅후 진행하기로 하였으나 합병 무산되었고 , 서비스 종료 요청 들어옴\n3. 갑자기 회사 상황 안좋아 지면서 자금경색 빠짐',
  },
];

export function appendChurnFieldValue(current: string, next: string): string {
  const cur = current.trim();
  const add = next.trim();
  if (!add) return cur;
  if (!cur) return add;
  return `${cur}\n\n${add}`;
}
