import { requireUser } from '@/lib/auth';
import { listStaffPresence, PRESENCE_ONLINE_MS } from '@/lib/presence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 직원 접속 상태 SSE (5초 간격) — Supabase Realtime 키 없이 Pro DB로 즉시 체감
 */
export async function GET(req: Request) {
  try {
    await requireUser();
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      const send = async () => {
        if (closed) return;
        try {
          const staff = await listStaffPresence();
          const payload = JSON.stringify({
            onlineWindowMs: PRESENCE_ONLINE_MS,
            staff,
            live: true,
            at: new Date().toISOString(),
          });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          /* keep stream */
        }
      };

      void send();
      const id = setInterval(() => void send(), 5_000);

      const abort = () => {
        if (closed) return;
        closed = true;
        clearInterval(id);
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      req.signal.addEventListener('abort', abort);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
