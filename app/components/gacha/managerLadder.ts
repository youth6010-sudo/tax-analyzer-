/** 담당자 사다리타기 — 세로줄 사이 가로대는 인접 교환(순열) */

export type LadderBoard = {
  tops: string[];
  /** rungs[row][col] = true → 그 행에서 col ↔ col+1 가로대 */
  rungs: boolean[][];
  /** 하단에 상호가 걸린 열 */
  prizeCol: number;
};

export function shuffleInPlace<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

function generateRungs(cols: number, rows: number): boolean[][] {
  const rungs: boolean[][] = [];
  for (let r = 0; r < rows; r += 1) {
    const row = Array.from({ length: Math.max(0, cols - 1) }, () => false);
    for (let c = 0; c < cols - 1; c += 1) {
      if (c > 0 && row[c - 1]) continue;
      if (Math.random() < 0.48) row[c] = true;
    }
    rungs.push(row);
  }
  return rungs;
}

export function buildLadderBoard(managers: string[]): LadderBoard | null {
  if (managers.length === 0) return null;
  const tops = shuffleInPlace(managers);
  const cols = tops.length;
  const rows = Math.max(7, cols * 2 + 1);
  const rungs = generateRungs(cols, rows);
  const prizeCol = Math.floor(Math.random() * cols);
  return { tops, rungs, prizeCol };
}

/** 각 행을 지난 뒤의 열 위치 (길이 = rungs.length + 1, [0]=출발 열) */
export function traceLadderColumns(startCol: number, rungs: boolean[][]): number[] {
  const path = [startCol];
  let col = startCol;
  for (const row of rungs) {
    if (col > 0 && row[col - 1]) col -= 1;
    else if (col < row.length && row[col]) col += 1;
    path.push(col);
  }
  return path;
}

export function resolveLadderWinner(board: LadderBoard): {
  name: string;
  startCol: number;
  columns: number[];
} {
  for (let i = 0; i < board.tops.length; i += 1) {
    const columns = traceLadderColumns(i, board.rungs);
    if (columns[columns.length - 1] === board.prizeCol) {
      return { name: board.tops[i]!, startCol: i, columns };
    }
  }
  // 이론상 순열이라 도달하지만, 방어적으로 prize 열로 떨어지는 첫 사람
  const columns = traceLadderColumns(0, board.rungs);
  return { name: board.tops[0]!, startCol: 0, columns };
}

export type LadderPoint = { x: number; y: number };

/** SVG 좌표 — 당첨 경로 폴리라인 */
export function ladderWinnerPoints(
  board: LadderBoard,
  columns: number[],
  width: number,
  height: number,
): LadderPoint[] {
  const cols = board.tops.length;
  const padX = 28;
  const topY = 36;
  const bottomY = height - 40;
  const span = Math.max(1, cols - 1);
  const xAt = (c: number) => (cols === 1 ? width / 2 : padX + (c / span) * (width - padX * 2));
  const rowCount = board.rungs.length;
  const rowY = (r: number) => topY + ((r + 0.5) / rowCount) * (bottomY - topY);

  const pts: LadderPoint[] = [{ x: xAt(columns[0]!), y: topY }];
  for (let r = 0; r < board.rungs.length; r += 1) {
    const before = columns[r]!;
    const after = columns[r + 1]!;
    const y = rowY(r);
    pts.push({ x: xAt(before), y });
    if (after !== before) pts.push({ x: xAt(after), y });
  }
  pts.push({ x: xAt(columns[columns.length - 1]!), y: bottomY });
  return pts;
}
