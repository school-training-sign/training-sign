import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const backend = fs.readFileSync(path.resolve(import.meta.dirname, '../apps-script/Code.gs'), 'utf8');
const utilities = {
  base64Decode(value) {
    return [...Buffer.from(value, 'base64')].map(byte => byte > 127 ? byte - 256 : byte);
  }
};
const { validateQrMascotData_ } = new Function(
  'Utilities',
  `${backend}\nreturn { validateQrMascotData_ };`
)(utilities);

function pngHeader({ width = 256, height = 256, totalBytes = 33, bitDepth = 8, colorType = 6 } = {}) {
  const bytes = Buffer.alloc(totalBytes);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = bitDepth;
  bytes[25] = colorType;
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

test('서버는 256×256 RGBA PNG QR 캐릭터와 빈 값만 허용한다', () => {
  const valid = pngHeader();
  assert.equal(validateQrMascotData_(valid), valid);
  assert.equal(validateQrMascotData_(''), '');
  assert.throws(() => validateQrMascotData_(valid.replace('image/png', 'image/svg+xml')), /PNG/);
  assert.throws(() => validateQrMascotData_('https://example.com/character.png'), /PNG/);
  assert.throws(() => validateQrMascotData_(pngHeader({ width: 255 })), /256픽셀/);
  assert.throws(() => validateQrMascotData_(pngHeader({ height: 255 })), /256픽셀/);
  assert.throws(() => validateQrMascotData_(pngHeader({ colorType: 2 })), /투명 PNG/);
  assert.throws(() => validateQrMascotData_(pngHeader({ totalBytes: 32769 })), /32KB/);
});

test('구버전 관리자 화면이 필드를 보내지 않아도 기존 캐릭터를 보존한다', () => {
  const body = backend.slice(backend.indexOf('function saveSettings_'), backend.indexOf('function saveTraining_'));
  assert.match(body, /Object\.prototype\.hasOwnProperty\.call\(input, 'qrMascotData'\)/);
  assert.match(body, /String\(current\.qrMascotData \|\| ''\)/);
  assert.match(body, /validateQrMascotData_\(input\.qrMascotData\)/);
});
