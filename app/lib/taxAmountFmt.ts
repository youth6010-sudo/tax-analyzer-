export const fmt = (v: string) => {
  const n = v.replace(/[^0-9]/g, '');
  return n ? parseInt(n).toLocaleString('ko-KR') : '';
};

export const toNum = (v: string | undefined) => {
  if (!v) return 0;
  const s = v.replace(/[\s\u00a0\u202f]/g, '').replace(/,/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};
