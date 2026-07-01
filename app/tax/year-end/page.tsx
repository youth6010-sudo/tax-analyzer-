import { redirect } from 'next/navigation';

/** 연말정산은 신고대상확인 탭으로 통합 */
export default function YearEndPage() {
  redirect('/clients/filing-check?tax=yearEnd');
}
