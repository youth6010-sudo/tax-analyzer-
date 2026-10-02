import type { BondRecipient } from '@/app/types/bond';

export const CERT_LETTER_FONT = '"Batang","바탕","BatangChe","Nanum Myeongjo","Noto Serif KR",serif';

const SENDER_NAME = '세무법인청년들';
const SENDER_ADDR = '부산광역시 해운대구 센텀중앙로 90, 큐비E센텀 1501호';
const SENDER_TEL = '전화 : 051) 783-6007';

export type CertifiedLetterContent = {
  recipient: BondRecipient;
  /** 2026 . 04 . */
  periodFrom: string;
  periodTo: string;
  amount: number;
  /** 2026 . 09 . 29 . */
  dateLabel: string;
};

/** 실제주소·사업장주소가 같으면(또는 사업장주소 없음) 주소만, 다르면 등록번호 + 송달장소 */
export function recipientLines(r: BondRecipient): string[] {
  const norm = (s: string) => s.replace(/\s+/g, '');
  const actual = r.실제주소.trim();
  const biz = r.사업장주소.trim();
  if (!actual) return [];
  if (!biz || norm(actual) === norm(biz)) return [actual];
  const label = r.구분 === '개인' ? '사업자등록번호' : '법인등록번호';
  return [...(r.등록번호 ? [`${label} : ${r.등록번호}`] : []), `송달장소 : ${actual}`];
}

/** 2026-09-29 → 2026 . 09 . 29 . */
export function formatCertDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[1]} . ${m[2]} . ${m[3]} .` : iso;
}

/** 내용증명 1쪽 — 기존 발송본(용역비 청구 통보) 양식 */
export default function CertifiedLetterSheet({ content }: { content: CertifiedLetterContent }) {
  const { recipient, periodFrom, periodTo, amount, dateLabel } = content;
  const lines = recipientLines(recipient);
  return (
    <article
      className="cert-letter mx-auto w-full max-w-[720px] bg-white px-9 py-10 text-[14px] leading-[1.9] text-black"
      data-capture-font={CERT_LETTER_FONT}
      style={{ fontFamily: CERT_LETTER_FONT, minHeight: 1000 }}
    >
      <h2 className="mt-6 text-center text-[17px] font-bold tracking-[0.9em]">내용증명</h2>

      <div className="mt-12 flex gap-6">
        <span className="shrink-0 tracking-[0.6em]">수신</span>
        <div>
          <p>{recipient.상호 || '(상호)'} 대표님 귀하</p>
          {lines.map(l => (
            <p key={l}>{l}</p>
          ))}
        </div>
      </div>

      <p className="mt-12">
        제목 :&nbsp;&nbsp; 용역비(기장 및 조정수수료 등) 청구 통보
      </p>
      <p className="mt-5">1. 귀사의 무궁한 발전을 기원합니다.</p>
      <p className="mt-5">2. 다름이 아니옵고,</p>
      <p className="mt-5">
        수신인에게 제공한 {periodFrom} 부터 {periodTo} 까지 발생된 용역비(기장 및 조정수수료 등)
        <br />
        청구한 금{' '}
        {amount.toLocaleString('ko-KR')}원에 대하여 지급을 하지 않고 있어 본 서면을 통보하오니, 도달 즉시 미수된
        수수료를 지급하여 주시기 바랍니다.
      </p>
      <p className="mt-7">
        3. 본 서면을 통보 받았음에도 이를 거절할 경우 할 수 없이, 법적절차에 의하여 청구할 수밖에 없음을 유의하시기
        바랍니다.
      </p>

      <p className="mt-14 text-center">{dateLabel}</p>

      <div className="mt-14 flex gap-4">
        <span className="shrink-0">발신인</span>
        <div>
          <p>{SENDER_NAME}</p>
          <p className="pl-1">{SENDER_ADDR}</p>
          <p className="pl-1">{SENDER_TEL}</p>
        </div>
      </div>
    </article>
  );
}
