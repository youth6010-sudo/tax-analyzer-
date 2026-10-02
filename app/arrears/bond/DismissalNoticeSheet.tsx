import type { ReactNode } from 'react';
import type { BondContact, BondNoticeVersion } from '@/app/types/bond';

const NAVY = '#1f3864';
const FONT = '"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo",sans-serif';

const OFFICE = '세무법인청년들 부산지점';
const OFFICE_LINE = '부산광역시 해운대구 센텀중앙로 90, 큐비E센텀 1501호   |   Tel 051-783-6007   |   Fax 051-784-6007';
const BANK = '부산은행 / 113-2016-5229-07 / 세무법인청년들';
const SIGNER = '대표세무사  신상협   (직인)';

export const NOTICE_VERSION_LABEL: Record<BondNoticeVersion, string> = {
  v1: 'v1.0 — 기한 내 입금 시 기장 유지 안내',
  'v1.5': 'v1.5 — v1 기한 경과, 기장해임 통보',
  v2: 'v2.0 — 해임 확정 통보',
};

/** 파일명용 버전 표기 (원본 docx 규칙: _v1.0 / _v1.5 / _v2.0) */
export const NOTICE_FILE_VERSION: Record<BondNoticeVersion, string> = { v1: 'v1.0', 'v1.5': 'v1.5', v2: 'v2.0' };

const TITLE_DISMISS = '세무보수 미수금 및 기장 대리 계약 해지(기장해임) 통보';
const P2_COMMON =
  '저희가 제공한 세무 용역에 대한 보수 중 아래 내역이 결제기일이 지나도록 입금되지 않아 안내드립니다. 여러 차례 연락드렸으나 확인이 어려워, 본사 채권관리 정책에 따라 회수 절차를 안내드리게 된 점 양해 부탁드립니다.';
const P3_DEADLINE = '아래 기한까지 전액 입금하시거나, 사정이 어려우신 경우 분납 등 상환 방법을 협의해 주시기 바랍니다.';
const P7_INQUIRY = '안내드린 내용에 이견이 있으시거나 문의사항이 있으시면 아래로 연락 주시기 바랍니다.';

/** 버전별로 다른 문구 — 제목, 2·3·4·6·7항 (나머지는 공통) */
const NOTICE_TEXT: Record<
  BondNoticeVersion,
  {
    title: string;
    p2: (prevDeadline: string) => string;
    p3: string;
    /** 3항 첫 줄 — 입금 기한/요청 */
    payLine: (deadline: string) => string;
    p4: string;
    p6: string;
    p7: string;
  }
> = {
  v1: {
    title: '세무보수 미수금 안내 및 향후 절차 안내',
    p2: () => P2_COMMON,
    p3: P3_DEADLINE,
    payLine: d => `입금 기한 : ${d}`,
    p4: '위 기한까지 입금 또는 협의가 이루어지지 않을 경우, 부득이하게 아래 절차가 순차적으로 진행될 수 있음을 알려드립니다. 어느 단계에서든 완납하시거나 상환 계획에 합의하시면 절차는 중단됩니다.',
    p6: '미납이 계속되는 경우 부득이하게 기장 등 세무 대리 업무가 중단되거나 계약이 해지될 수 있습니다. 다만 진행 중인 신고 업무는 기한 내에 마무리하며, 보수가 완납되면 세무서비스는 즉시 정상화됩니다.',
    p7: '저희는 귀사와의 협력 관계를 계속 이어가기를 바랍니다. 내용에 이견이 있으시거나 상환 방법을 협의하고자 하시면 아래로 연락 주시기 바랍니다.',
  },
  'v1.5': {
    title: TITLE_DISMISS,
    p2: prev =>
      `저희가 제공한 세무 용역에 대한 보수 중 아래 내역이 결제기일이 지나도록 입금되지 않아, ${prev || '○○○○년 ○○월 ○○일'}을 기한으로 입금 또는 상환 방법 협의를 요청드린 바 있습니다. 그러나 해당 기한까지 입금 및 협의가 모두 이루어지지 않아, 부득이하게 귀사와의 기장 대리 계약을 해지(기장해임)하게 되었음을 알려드립니다.`,
    p3: '다만 위 미수 보수는 계약 해지와 별개로 귀사의 채무로 남아있으므로, 아래 계좌로 조속히 전액 입금하여 주시기 바랍니다.',
    payLine: () => '입금 요청 : 본 통보 확인 즉시',
    p4: '위 미수 보수가 입금되지 않을 경우, 부득이하게 아래 절차가 순차적으로 진행될 수 있음을 알려드립니다. 입금이 확인되는 즉시 절차는 중단됩니다.',
    p6: '기장해임에 따라 세무 대리 업무는 본 통보일자로 중단되며, 다만 진행 중인 신고 업무는 기한 내에 마무리하여 드립니다. 추후 미수 보수가 완납되는 경우 재계약 여부는 별도로 협의 가능합니다.',
    p7: P7_INQUIRY,
  },
  v2: {
    title: TITLE_DISMISS,
    p2: () => P2_COMMON,
    p3: P3_DEADLINE,
    payLine: d => `입금 기한 : ${d}`,
    p4: '위 기한까지 전액 입금되지 않을 경우, 부득이하게 아래 절차가 순차적으로 진행됨을 알려드립니다. 완납하시는 경우에 한하여 절차가 중단됩니다.',
    p6: '이에 따라 귀사와의 기장 대리 계약을 해지(기장해임)하며, 세무 대리 업무를 중단함을 알려드립니다. 다만 진행 중인 신고 업무는 기한 내에 마무리하여 드리며, 위 미수 보수가 완납될 경우 재계약 여부는 별도로 협의 가능합니다.',
    p7: P7_INQUIRY,
  },
};

export type DismissalNoticeContent = {
  version: BondNoticeVersion;
  docNo: string;
  /** 2026년 10월 01일 */
  sentDateLabel: string;
  recipientName: string;
  /** 2018.07 ~ 2026.08 */
  period: string;
  amount: number;
  deadlineLabel: string;
  /** v1.5 — 직전 v1 기한 */
  prevDeadlineLabel: string;
  closingDateLabel: string;
  contact: BondContact;
};

/** 2026-10-01 → 2026년 10월 01일 */
export function formatNoticeDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[1]}년 ${m[2]}월 ${m[3]}일` : iso;
}

function Para({ n, children }: { n: number; children: string }) {
  return (
    <p className="mt-9">
      {n}. {children}
    </p>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return <p className="mt-2 pl-4">· {children}</p>;
}

const PAGE_CLASS = 'notice-page mx-auto w-full max-w-[720px] bg-white px-10 py-12 text-[14px] leading-[2] text-black';
const PAGE_STYLE = { fontFamily: FONT, minHeight: 1000 } as const;

/** 해임통보 안내문 — 원본 docx와 같은 쪽 나눔(1쪽: 3항까지, 2쪽: 4항부터) */
export default function DismissalNoticeSheet({ content }: { content: DismissalNoticeContent }) {
  const t = NOTICE_TEXT[content.version];
  const won = `${content.amount.toLocaleString('ko-KR')}원`;
  const { contact } = content;

  return (
    <div className="space-y-6">
      <article className={PAGE_CLASS} data-capture-font={FONT} style={PAGE_STYLE}>
        <div className="border-b border-slate-500 pb-5 text-center">
          <h2 className="text-[24px] font-bold" style={{ color: NAVY }}>
            {OFFICE}
          </h2>
          <p className="mt-3 whitespace-pre text-[11px] text-slate-600">{OFFICE_LINE}</p>
        </div>

        <div className="mt-4 text-right text-[13px]">
          <p>문서번호 : {content.docNo}</p>
          <p className="mt-1">발신일자 : {content.sentDateLabel}</p>
        </div>

        <p className="mt-6 font-bold">수신 : {content.recipientName} 대표님 귀하</p>
        <h3 className="mt-4 text-center text-[17px] font-bold" style={{ color: NAVY }}>
          제목 : {t.title}
        </h3>

        <Para n={1}>
          귀사의 무궁한 발전을 기원합니다. 그동안 저희 세무법인청년들 부산지점을 이용해 주셔서 감사합니다.
        </Para>
        <Para n={2}>{t.p2(content.prevDeadlineLabel)}</Para>

        <p className="mt-4 font-bold">[미수 내역]</p>
        <table className="mt-2 w-full border-collapse text-[13px] leading-normal">
          <thead>
            <tr style={{ backgroundColor: NAVY }} className="text-white">
              <th className="border border-slate-400 px-2 py-1.5 font-semibold">항목</th>
              <th className="border border-slate-400 px-2 py-1.5 font-semibold">귀속기간</th>
              <th className="border border-slate-400 px-2 py-1.5 font-semibold">금액(부가세 포함)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-slate-400 px-2 py-1.5 text-center">용역비(기장 및 조정수수료 등)</td>
              <td className="border border-slate-400 px-2 py-1.5 text-center">{content.period}</td>
              <td className="border border-slate-400 px-2 py-1.5 text-right">{won}</td>
            </tr>
            <tr>
              <td className="border border-slate-400 px-2 py-1.5 text-center">합계</td>
              <td className="border border-slate-400 px-2 py-1.5" />
              <td className="border border-slate-400 px-2 py-1.5 text-right">{won}</td>
            </tr>
          </tbody>
        </table>

        <Para n={3}>{t.p3}</Para>
        <Bullet>{t.payLine(content.deadlineLabel)}</Bullet>
        <Bullet>입금 계좌 : {BANK}</Bullet>
        <Bullet>이미 입금하셨다면 입금자명·입금일자를 알려주시면 바로 확인하겠습니다.</Bullet>
      </article>

      <article className={PAGE_CLASS} data-capture-font={FONT} style={PAGE_STYLE}>
        <p className="mt-2">4. {t.p4}</p>
        <p className="mt-3 pl-4">(1) 법원에 지급명령 신청 또는 민사소송 제기</p>
        <p className="mt-1 pl-4">(2) 지급명령·판결 확정 시 강제집행 (예금·매출대금 등 채권 압류, 유체동산·부동산 집행)</p>

        <Para n={5}>
          소송 절차로 진행될 경우 미수 보수 외에 지연손해금(지급기일 다음 날부터 완제일까지, 소송 진행 시 연 12%)과 소송비용(인지대·송달료 및 변호사 보수의 일부)이 함께 청구되며, 판결에 따라 그 부담이 귀사에 돌아갈 수 있습니다. 조기에 정리하시는 것이 비용 측면에서 유리합니다.
        </Para>
        <Para n={6}>{t.p6}</Para>
        <Para n={7}>{t.p7}</Para>
        <p className="mt-2 whitespace-pre-wrap pl-4">
          · 담당 : {contact.담당}{'     '}· 전화 : {contact.전화}{'     '}· 이메일 : {contact.이메일}
        </p>

        <p className="mt-28 text-center">{content.closingDateLabel}</p>
        <p className="mt-14 text-center text-[17px] font-bold" style={{ color: NAVY }}>
          {OFFICE}
        </p>
        <p className="mt-2 whitespace-pre text-center">{SIGNER}</p>
      </article>
    </div>
  );
}
