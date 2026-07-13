'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TemplateSource } from '../_lib/template';
import {
  applyOfficialLetterVars,
  normalizeOfficialLetterHtml,
  OFFICIAL_LETTER_TOKENS,
  type OfficialLetterVars,
} from '../_lib/officialLetter';
import { prepareOfficialLetterPasteContent } from '../_lib/noticeFormatCommands';
import { scrubOfficialLetterBackgroundOnly } from '../_lib/templates';
import NoticeFormatToolbar from './NoticeFormatToolbar';
import { TemplateSourceToggle } from './TemplateSourceToggle';
import { noticeBtnSecondary, noticeSectionCompact, noticeSectionTitle } from './noticeUi';
import '../_lib/officialLetter.scoped.css';
import '../_lib/officialFormalLetter.scoped.css';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

type Props = {
  storageKey: string;
  kind: string;
  title: string;
  defaultHtml: string;
  customHtml: string;
  source: TemplateSource;
  vars: OfficialLetterVars;
  onChange: (html: string) => void;
  onSourceChange: (source: TemplateSource) => void;
  onSave: () => void;
  hasCustomSaved: boolean;
  saveState?: SaveState;
  layout?: 'prep' | 'formal';
};

function ensureFontAwesome() {
  if (typeof document === 'undefined') return;
  const id = 'notice-fa-styles';
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
  document.head.appendChild(link);
}

function ensureNotoSans() {
  if (typeof document === 'undefined') return;
  const id = 'notice-noto-font';
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap';
  document.head.appendChild(link);
}

export default function OfficialLetterEditor({
  storageKey,
  kind,
  title,
  defaultHtml,
  customHtml,
  source,
  vars,
  onChange,
  onSourceChange,
  onSave,
  hasCustomSaved,
  saveState = 'idle',
  layout = 'prep',
}: Props) {
  const pageRef = useRef<HTMLDivElement>(null);
  const baselineRef = useRef('');
  const skipSyncRef = useRef(false);
  const focusedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [moveMode, setMoveMode] = useState(false);
  const isCustom = source === 'custom';

  useEffect(() => {
    ensureFontAwesome();
    ensureNotoSans();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const varsKey = [
    vars.attributionYear,
    vars.periodLabel,
    vars.materialDeadlineShort,
    vars.managerEmail,
    vars.companyName,
    vars.documentNumber,
    vars.letterDate,
    vars.subject,
    vars.filingParagraph,
    vars.materialSubmitSentence,
    vars.coveragePeriod,
    vars.periodNoteLine,
    vars.vatFormalBodyHtml,
    vars.vatPrepCommonRows,
    vars.vatPrepIndustryRows,
    vars.corporateFormalBodyHtml,
  ].join('|');

  const syncPageFromTemplate = useCallback(() => {
    const el = pageRef.current;
    if (!el) return;
    const template = isCustom && customHtml.trim() ? customHtml : defaultHtml;
    skipSyncRef.current = true;
    const html = applyOfficialLetterVars(template, vars);
    el.innerHTML = html;
    scrubOfficialLetterBackgroundOnly(el);
    baselineRef.current = el.innerHTML;
    requestAnimationFrame(() => {
      skipSyncRef.current = false;
    });
  }, [isCustom, customHtml, defaultHtml, vars]);

  useEffect(() => {
    syncPageFromTemplate();
    // kind/source/기간·담당자 토큰 변경 시에만 화면 갱신 (편집 중 customHtml 변경은 무시)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, source, varsKey, defaultHtml, storageKey]);

  const emitChange = (scrubBg = false) => {
    if (!pageRef.current || !isCustom || skipSyncRef.current) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    // 굵게·색·크기는 유지하고 붙여넣기 배경만 정리
    if (scrubBg) scrubOfficialLetterBackgroundOnly(pageRef.current);
    const normalized = normalizeOfficialLetterHtml(pageRef.current.innerHTML);
    onChange(normalized);
  };

  const scheduleEmit = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      if (focusedRef.current) emitChange(false);
    }, 600);
  };

  const handleBlur = () => {
    focusedRef.current = false;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    emitChange(true);
  };

  const insertSanitizedContent = (html: string, plain: string) => {
    const fragment = prepareOfficialLetterPasteContent(html, plain);
    if (!fragment) return;
    document.execCommand('insertHTML', false, fragment);
    scheduleEmit();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!isCustom) return;
    e.preventDefault();
    insertSanitizedContent(
      e.clipboardData.getData('text/html'),
      e.clipboardData.getData('text/plain'),
    );
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isCustom) return;
    e.preventDefault();
    insertSanitizedContent(e.dataTransfer.getData('text/html'), e.dataTransfer.getData('text/plain'));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isCustom) return;
    e.preventDefault();
  };

  const handleReset = () => {
    if (!pageRef.current) return;
    const html = applyOfficialLetterVars(defaultHtml, vars);
    pageRef.current.innerHTML = html;
    if (isCustom) onChange(normalizeOfficialLetterHtml(defaultHtml));
  };

  const loadDefaultIntoCustom = () => {
    onChange(defaultHtml);
    onSourceChange('custom');
  };

  const handlePrint = () => {
    const el = pageRef.current;
    if (!el) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8" />
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap" />
      <style>${getPrintCss()}</style></head><body>${el.outerHTML}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const captureCanvas = async () => {
    const el = pageRef.current;
    if (!el) return null;
    const html2canvas = (await import('html2canvas')).default;
    return html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    });
  };

  const handlePdf = async () => {
    const canvas = await captureCanvas();
    if (!canvas) return;
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
    const img = canvas.toDataURL('image/png');
    pdf.addImage(img, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save(`${title.replace(/\s+/g, '_')}.pdf`);
  };

  const handlePng = async () => {
    const canvas = await captureCanvas();
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${title.replace(/\s+/g, '_')}.png`;
    a.click();
  };

  return (
    <section className={noticeSectionCompact}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={noticeSectionTitle}>{title}</h3>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={noticeBtnSecondary} onClick={handlePrint}>
            인쇄
          </button>
          <button type="button" className={noticeBtnSecondary} onClick={() => void handlePng()}>
            PNG
          </button>
          <button type="button" className={noticeBtnSecondary} onClick={() => void handlePdf()}>
            PDF
          </button>
          <button
            type="button"
            className={noticeBtnSecondary}
            onClick={() => setMoveMode(v => !v)}
            title="요소 위치 미세 조정"
          >
            {moveMode ? '이동 ON' : '이동 OFF'}
          </button>
          <button type="button" className={noticeBtnSecondary} onClick={handleReset}>
            기본값 복원
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
        <TemplateSourceToggle
          source={source}
          onSourceChange={onSourceChange}
          hasCustom={hasCustomSaved}
          onSave={() => {
            emitChange(true);
            onSave();
          }}
          saveState={saveState}
        />

        <p className="text-xs text-slate-500">
          {layout === 'formal'
            ? '엑셀·PDF 공문 양식과 동일한 헤더(로고·연락처)와 본문 번호 목록이 표시됩니다. 편집 후 「내 서식 저장」을 누르면 담당자 계정에 저장됩니다.'
            : 'A4 공문을 직접 수정할 수 있습니다. 하단 연락처의 '}
          {layout !== 'formal' && (
            <>
              <span className="font-mono text-blue-700">{'{담당자메일}'}</span>은 로그인 담당자
              메일로 자동 치환됩니다. 편집 후 「내 서식 저장」을 누르면 담당자 계정에 저장됩니다.
            </>
          )}
        </p>

        {isCustom && (
          <div className="flex flex-wrap gap-1.5">
            {OFFICIAL_LETTER_TOKENS.map(t => (
              <span
                key={t.token}
                title={t.desc}
                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-blue-700"
              >
                {t.token}
              </span>
            ))}
          </div>
        )}

        {!isCustom && (
          <div className="flex justify-end">
            <button type="button" className={noticeBtnSecondary} onClick={loadDefaultIntoCustom}>
              내 서식으로 편집
            </button>
          </div>
        )}

        {isCustom && (
          <NoticeFormatToolbar
            editorRef={pageRef}
            disabled={!isCustom}
            onAfterFormat={() => scheduleEmit()}
          />
        )}

        <div className={`official-letter-editor layout-${layout} overflow-x-auto rounded-xl bg-slate-200/80 p-2 sm:p-3`}>
          <p className="mb-2 text-center text-xs text-slate-600">
            <i className="fa-solid fa-pen-to-square" /> 글자를 선택한 뒤 위 서식 툴바로 크기·굵게·색을 적용하세요
          </p>
          <div
            ref={pageRef}
            className={`a4-page mx-auto ${moveMode ? 'move-mode' : ''}`}
            contentEditable={isCustom}
            suppressContentEditableWarning
            onFocus={() => {
              focusedRef.current = true;
            }}
            onInput={scheduleEmit}
            onBlur={handleBlur}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          />
        </div>
      </div>
    </section>
  );
}

function getPrintCss(): string {
  return `
    :root { --a4-width: 794px; --navy: #002D62; --gold: #C5A059; }
    body { margin: 0; font-family: "Noto Sans KR", sans-serif; }
    .a4-page { width: 794px; margin: 0 auto; background: #fff; padding: 34px 38px 28px; position: relative; }
    .a4-page::before, .a4-page::after { content: ""; position: absolute; left: 0; width: 100%; height: 10px; background: linear-gradient(90deg, #002D62, #C5A059); }
    .a4-page::before { top: 0; } .a4-page::after { bottom: 0; }
    header { text-align: center; margin-bottom: 16px; border-bottom: 1px solid #eee; padding-bottom: 12px; }
    .sub-top { color: #C5A059; font-weight: 700; font-size: 14px; letter-spacing: 2px; display: block; margin-bottom: 6px; }
    .main-title { font-size: 32px; color: #002D62; margin: 0; font-weight: 700; }
    .guide-msg { background: #f1f5f9; padding: 7px 10px; border-radius: 5px; font-size: 13px; color: #475569; margin-top: 10px; display: inline-block; }
    .content-grid { display: flex; flex-direction: column; gap: 10px; }
    .section-box { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    .section-header { background: #f8fafc; padding: 9px 16px; border-bottom: 2px solid #002D62; display: flex; align-items: center; gap: 8px; }
    .section-header h3 { margin: 0; font-size: 15px; color: #002D62; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 6px 12px; font-size: 12.5px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .num-badge { display: inline-block; width: 19px; height: 19px; background: #002D62; color: #fff; text-align: center; line-height: 19px; border-radius: 50%; font-size: 9px; font-weight: 700; margin-right: 8px; }
    .item-name { font-weight: 700; color: #334155; width: 32%; }
    .item-desc { color: #64748b; }
    footer { margin-top: 10px; padding-top: 12px; border-top: 2px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
    .contact-details { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; }
    .contact-item { font-size: 11.5px; color: #475569; }
    .brand-logo { width: 150px; max-height: 46px; object-fit: contain; }
  `;
}
