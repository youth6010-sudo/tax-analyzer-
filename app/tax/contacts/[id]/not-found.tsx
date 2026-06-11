import Link from 'next/link';
import BackButton from '../../../components/BackButton';

export default function ContactNotFound() {
  return (
    <main className="flex-1 flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center space-y-4">
        <p className="text-lg font-bold text-gray-700">거래처를 찾을 수 없습니다</p>
        <div className="flex items-center justify-center gap-3">
          <BackButton label="이전 페이지" />
          <Link
            href="/tax/comprehensive"
            className="text-sm font-semibold text-blue-600 hover:text-blue-800"
          >
            홈으로
          </Link>
        </div>
      </div>
    </main>
  );
}
