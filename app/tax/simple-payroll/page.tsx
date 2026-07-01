import { redirect } from 'next/navigation';

/** 간이지급명세서는 신고대상확인 탭으로 통합 */
export default function SimplePayrollPage() {
  redirect('/clients/filing-check?tax=simplePayroll');
}
