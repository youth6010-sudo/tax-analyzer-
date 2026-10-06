import type { ReactNode } from 'react';
import type { BondContact } from '@/app/types/bond';

const NAVY = '#1f3864';
const FONT = '"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo",sans-serif';

const OFFICE = '세무법인청년들 부산지점';
const OFFICE_LINE = '부산광역시 해운대구 센텀중앙로 90, 큐비E센텀 1501호   |   Tel 051-783-6007   |   Fax 051-784-6007';
const BANK = '부산은행 / 113-2016-5229-07 / 세무법인청년들';
const TITLE = '세무보수 미수금 지급 요청 및 향후 절차 안내';

/** 해임통보 공문 종류 — 원본: 세무보수_미수금_안내문_v.유예.docx / v.기장.docx */
export type DismissalNoticeKind = '유예' | '기장';

export const NOTICE_KIND_LABEL: Record<DismissalNoticeKind, string> = {
  유예: '유예 공문 — 기한 내 입금·분할합의 없으면 법적 절차',
  기장: '기장 공문 — 법적 절차 + 기한 경과 시 세무대리계약 해지',
};

export type DismissalNoticeContent = {
  kind: DismissalNoticeKind;
  docNo: string;
  /** YYYY-MM-DD */
  sentDate: string;
  recipientName: string;
  /** 2018.07 ~ 2026.08 */
  period: string;
  amount: number;
  /** YYYY-MM-DD */
  deadline: string;
  contact: BondContact;
};

/** 2026-10-01 → 2026년 10월 01일 (머리·입금기한·끝 날짜) */
export function formatNoticeDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[1]}년 ${m[2]}월 ${m[3]}일` : iso;
}

/** 2026-10-06 → 2026년 10월 6일 (본문 문장 안) */
function formatInlineDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : iso;
}

/** 저장 파일명 — 세무보수_미수금_안내문_{수신}_{2026.10.06}.pdf (수정본은 _수정) */
export function noticeFilename(recipientName: string, sentDate: string, edited = false): string {
  const name = recipientName.replace(/[\\/:*?"<>|]/g, '').trim() || '업체';
  return `세무보수_미수금_안내문_${name}_${sentDate.replace(/-/g, '.')}${edited ? '_수정' : ''}.pdf`;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

/** 해임통보 안내문 — 1쪽: 3항까지, 2쪽: 4항부터 */
export default function DismissalNoticeSheet({ content }: { content: DismissalNoticeContent }) {
  const won = `${content.amount.toLocaleString('ko-KR')}원`;
  const { contact, kind } = content;
  const terminateDate = formatInlineDate(addDaysIso(content.deadline, 1));

  const p4 =
    kind === '유예'
      ? '위 납부기한까지 미수금 전액이 지급되거나 당 법인과 분할변제에 관한 서면합의가 체결되지 않을 경우, 부득이하게 아래 절차가 순차적으로 진행됨을 알려드립니다. 완납하시는 경우에 한하여 절차가 중단됩니다.'
      : '위 기한과는 별개로, 부득이하게 아래 절차가 순차적으로 진행됨을 알려드립니다. 완납하시는 경우에 한하여 절차가 중단됩니다.';
  const contactPara =
    '저희는 귀사와의 협력 관계를 계속 이어가기를 바랍니다. 내용에 이견이 있으시거나 분할변제를 협의하고자 하시면 아래로 연락 주시기 바랍니다.';

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
          <p className="mt-1">발신일자 : {formatNoticeDate(content.sentDate)}</p>
        </div>

        <p className="mt-6 font-bold">수신 : {content.recipientName} 대표님 귀하</p>
        <h3 className="mt-4 text-center text-[17px] font-bold" style={{ color: NAVY }}>
          제목 : {TITLE}
        </h3>

        <Para n={1}>
          귀사의 무궁한 발전을 기원합니다. 그동안 저희 세무법인청년들 부산지점을 이용해 주셔서 감사합니다.
        </Para>
        <Para n={2}>
          {`저희가 제공한 세무대리용역 보수 중 아래 미수내역이 각 지급기일을 경과하였음에도 지급되지 않았습니다. 수차례 납부를 요청드렸으나 ${formatInlineDate(content.sentDate)} 현재까지 입금이 확인되지 않아, 본사 채권관리 정책에 따라 회수 절차를 안내드리게 된 점 양해 부탁드립니다.`}
        </Para>

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

        <Para n={3}>
          아래 기한까지 미수금 전액을 입금해 주시기 바랍니다. 일시납이 곤란한 경우에는 같은 기한까지 분할변제 방안에 관한 서면합의를 체결해 주시기 바랍니다.
        </Para>
        <Bullet>입금 기한 : {formatNoticeDate(content.deadline)}</Bullet>
        <Bullet>입금 계좌 : {BANK}</Bullet>
        <Bullet>이미 입금하셨다면 입금자명·입금일자를 알려주시면 바로 확인하겠습니다.</Bullet>
      </article>

      <article className={PAGE_CLASS} data-capture-font={FONT} style={PAGE_STYLE}>
        <p className="mt-2">4. {p4}</p>
        <p className="mt-3 pl-4">(1) 법원에 지급명령 신청 또는 민사소송 제기</p>
        <p className="mt-1 pl-4">(2) 지급명령·판결 확정 시 강제집행 (예금·매출대금 등 채권 압류, 유체동산·부동산 집행)</p>

        <Para n={5}>
          미수금의 지연손해금은 해당 지급기일 다음 날부터 계약상 약정이율 또는 관계 법령상 이율에 따라 산정합니다. 소장 또는 이에 준하는 서면이 송달된 다음 날부터는 「소송촉진 등에 관한 특례법」이 정한 이율(현재 연 12%)이 적용될 수 있습니다. 소송비용은 판결 및 소송비용액확정절차의 결과에 따라 귀사가 부담할 수 있습니다.
        </Para>
        {kind === '기장' ? (
          <Para n={6}>
            {`위 입금 기한까지 미수금 전액이 지급되거나 분할변제에 관한 서면합의가 체결되지 않을 경우, 귀사와의 세무대리계약은 ${terminateDate}자로 해지되고 같은 날부터 세무대리업무를 종료합니다. 다만, 종료일 현재 이미 착수한 업무에 한하여 해당 신고기한까지 마무리하며, 그 밖의 업무는 종료합니다. 기한 경과 후 미수금을 지급하더라도 계약은 자동으로 복원되지 않으며, 서비스 재개는 별도의 서면 재계약이 체결된 경우에만 가능합니다.`}
          </Para>
        ) : null}
        <Para n={kind === '기장' ? 7 : 6}>{contactPara}</Para>
        <p className="mt-2 whitespace-pre-wrap pl-4">
          · 담당 : {contact.담당}{'     '}· 전화 : {contact.전화}{'     '}· 이메일 : {contact.이메일}
        </p>

        <p className="mt-28 text-center">{formatNoticeDate(content.sentDate)}</p>
        <div className="mt-14 flex items-center justify-center">
          <span className="text-[16px]" style={{ color: NAVY }}>
            {OFFICE}
          </span>
          <span className="relative ml-6 inline-block">
            (직인)
            {/* eslint-disable-next-line @next/next/no-img-element -- PDF 캡처용 원본 이미지 */}
            <img
              src="/seal-youth-busan.png"
              alt=""
              data-capture-keep="1"
              width={64}
              height={64}
              style={{ left: '50%', top: '50%', marginLeft: -32, marginTop: -32 }}
              className="pointer-events-none absolute h-16 w-16 max-w-none"
            />
          </span>
        </div>
      </article>
    </div>
  );
}
