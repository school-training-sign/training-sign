import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const backend = fs.readFileSync(path.join(root, 'apps-script', 'Code.gs'), 'utf8');

function createHarness() {
  const properties = new Map([['PUBLIC_DATA_REVISION', 'revision-1']]);
  const cachedValues = new Map();
  let uuid = 1;
  const propertyStore = {
    getProperty: key => properties.get(key) || null,
    setProperty: (key, value) => properties.set(key, String(value))
  };
  const cache = {
    get: key => cachedValues.get(key) ?? null,
    put: (key, value) => cachedValues.set(key, String(value)),
    getAll: keys => Object.fromEntries(keys.filter(key => cachedValues.has(key)).map(key => [key, cachedValues.get(key)])),
    putAll: values => Object.entries(values).forEach(([key, value]) => cachedValues.set(key, String(value))),
    remove: key => cachedValues.delete(key),
    removeAll: keys => keys.forEach(key => cachedValues.delete(key))
  };
  const PropertiesService = { getScriptProperties: () => propertyStore };
  const CacheService = { getScriptCache: () => cache };
  const Utilities = { getUuid: () => `revision-${++uuid}` };
  const load = new Function('PropertiesService', 'CacheService', 'Utilities', `${backend}
return {
  getPublicData_: getPublicData_,
  publicDataRevision_: publicDataRevision_,
  readCachedPublicData_: readCachedPublicData_,
  writeCachedPublicData_: writeCachedPublicData_,
  invalidatePublicDataCache_: invalidatePublicDataCache_,
  configurePublic: function() {
    let rowReads = 0;
    requireInitialized_ = function() {};
    requireShareToken_ = function(token) {
      if (token !== 'valid-share-token') apiError_('INVALID_LINK', '잘못된 공유 키');
    };
    today_ = function() { return '2026-08-14'; };
    readSettings_ = function() {
      rowReads += 1;
      return {
        schoolName: '테스트 학교', subtitle: '연수 참여 확인', notice: '', brandColor: '#315c54',
        privacyPurpose: '연수 참여 확인', privacyItems: '부서, 성명, 서명', privacyRetention: '출력 뒤 삭제', faviconData: ''
      };
    };
    readRows_ = function(definition) {
      rowReads += 1;
      if (definition === SHEETS.STAFF) return [{ id: 'staff-1', department: '교무부', name: '홍길동', active: true, sortOrder: 1 }];
      if (definition === SHEETS.TRAININGS) return [{ id: 'training-1', title: '테스트 연수', daily: true, active: true, sortOrder: 1 }];
      return [];
    };
    return function() { return rowReads; };
  }
};`);
  return { api: load(PropertiesService, CacheService, Utilities), properties, cachedValues };
}

test('공개 데이터는 공유 키를 먼저 검증하고 같은 날짜·버전·개정에서 시트를 한 번만 읽는다', () => {
  const { api } = createHarness();
  const rowReads = api.configurePublic();
  const first = api.getPublicData_('valid-share-token');
  const firstReads = rowReads();
  const second = api.getPublicData_('valid-share-token');

  assert.ok(firstReads >= 3);
  assert.equal(rowReads(), firstReads);
  assert.deepEqual(second, first);
  assert.throws(() => api.getPublicData_('invalid-share-token'), error => error.apiCode === 'INVALID_LINK');
});

test('관리자 변경은 캐시 개정을 교체해 다음 공개 요청에서 새 데이터를 읽게 한다', () => {
  const { api, properties } = createHarness();
  const rowReads = api.configurePublic();
  api.getPublicData_('valid-share-token');
  const before = rowReads();

  api.invalidatePublicDataCache_();
  assert.notEqual(properties.get('PUBLIC_DATA_REVISION'), 'revision-1');
  api.getPublicData_('valid-share-token');
  assert.ok(rowReads() > before);
});

test('큰 공개 응답은 안전한 크기로 나눠 저장하고 오래된 요청은 새 개정 캐시를 덮지 않는다', () => {
  const { api, properties, cachedValues } = createHarness();
  const data = {
    settings: { schoolName: '가'.repeat(45000) },
    staff: [], trainings: [], privacyReady: true, serverDate: '2026-08-14'
  };
  api.writeCachedPublicData_('revision-1', '2026-08-14', data);
  assert.deepEqual(api.readCachedPublicData_('revision-1', '2026-08-14'), data);
  assert.ok([...cachedValues.keys()].filter(key => key.includes('_C')).length >= 3);

  properties.set('PUBLIC_DATA_REVISION', 'revision-new');
  const sizeBefore = cachedValues.size;
  api.writeCachedPublicData_('revision-1', '2026-08-14', { ...data, settings: { schoolName: '오래된 값' } });
  assert.equal(cachedValues.size, sizeBefore);
  assert.equal(api.readCachedPublicData_('revision-1', '2026-08-15'), null);
});
