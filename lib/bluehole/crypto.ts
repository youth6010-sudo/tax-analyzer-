// 블루홀 담당자 비밀번호를 DB에 저장하기 위한 대칭 암호화 (AES-256-GCM).
// 키는 BLUEHOLE_ENC_KEY 환경변수에서 가져온다.
//   - 64자리 hex 면 그대로 32바이트 키로 사용
//   - 그 외 문자열이면 sha256 으로 32바이트 파생
// 저장 형식: "v1:<iv_b64>:<tag_b64>:<ciphertext_b64>"
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

function getKey(): Buffer {
  const raw = process.env.BLUEHOLE_ENC_KEY;
  if (!raw) {
    throw new Error('BLUEHOLE_ENC_KEY 환경변수가 없습니다. (.env.local / Vercel 에 설정 필요)');
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  return createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

export function decryptSecret(enc: string): string {
  if (!enc) return '';
  const parts = enc.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('블루홀 자격증명 복호화 실패: 형식 오류');
  }
  const [, ivB, tagB, ctB] = parts;
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]);
  return pt.toString('utf8');
}
