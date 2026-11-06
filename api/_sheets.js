// Google Sheets REST 헬퍼 (의존성 없음: Node 내장 crypto + fetch만 사용)
// 서비스 계정으로 인증하고, 웜 인스턴스에서는 토큰·탭 정보를 재사용해 속도를 높입니다.
const crypto = require('crypto');

const SHEET_ID = process.env.SHEET_ID;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

const LOGS_TAB = process.env.LOGS_TAB || 'Logs';
const EXERCISES_TAB = process.env.EXERCISES_TAB || 'Exercises';

const LOG_HEADER = ['id', 'date', 'routine', 'exercise', 'sets', 'memo', 'createdAt'];
const EXERCISE_HEADER = ['routine', 'exercise'];

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

let tokenCache = { value: null, exp: 0 };
let tabsReady = false;
let sheetGids = {};

function configured() {
  return Boolean(SHEET_ID && SA_EMAIL && SA_KEY);
}

const b64url = (input) => Buffer.from(input).toString('base64url');

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.value && tokenCache.exp - 60 > now) return tokenCache.value;

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: SA_EMAIL,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(`${header}.${claim}`)
    .sign(SA_KEY)
    .toString('base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  if (!res.ok) throw new Error(`token request failed: ${res.status}`);

  const json = await res.json();
  tokenCache = { value: json.access_token, exp: now + (json.expires_in || 3600) };
  return tokenCache.value;
}

async function sheetsFetch(path, options = {}) {
  const token = await getToken();
  const res = await fetch(`${BASE}/${SHEET_ID}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`sheets request failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// 탭이 없으면 만들고 헤더 행을 채웁니다 (최초 1회).
async function ensureTabs() {
  if (tabsReady) return;

  const meta = await sheetsFetch('?fields=sheets.properties(sheetId,title)');
  const existing = {};
  meta.sheets.forEach((s) => {
    existing[s.properties.title] = s.properties.sheetId;
  });

  const wanted = [
    [LOGS_TAB, LOG_HEADER],
    [EXERCISES_TAB, EXERCISE_HEADER],
  ];
  const missing = wanted.filter(([title]) => !(title in existing));

  if (missing.length > 0) {
    const result = await sheetsFetch(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        requests: missing.map(([title]) => ({ addSheet: { properties: { title } } })),
      }),
    });
    result.replies.forEach((reply, i) => {
      existing[missing[i][0]] = reply.addSheet.properties.sheetId;
    });
    for (const [title, header] of missing) {
      await sheetsFetch(`/values/${encodeURIComponent(`${title}!A1`)}?valueInputOption=RAW`, {
        method: 'PUT',
        body: JSON.stringify({ values: [header] }),
      });
    }
  }

  sheetGids = existing;
  tabsReady = true;
}

async function readRows(tab, lastCol) {
  await ensureTabs();
  const range = encodeURIComponent(`${tab}!A2:${lastCol}`);
  const result = await sheetsFetch(`/values/${range}?valueRenderOption=UNFORMATTED_VALUE`);
  return result.values || [];
}

async function appendRow(tab, lastCol, row) {
  await ensureTabs();
  const range = encodeURIComponent(`${tab}!A:${lastCol}`);
  await sheetsFetch(`/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: JSON.stringify({ values: [row] }),
  });
}

// A열의 id가 일치하는 행을 삭제합니다. 삭제했으면 true.
async function deleteRowById(tab, id) {
  await ensureTabs();
  const range = encodeURIComponent(`${tab}!A2:A`);
  const result = await sheetsFetch(`/values/${range}?valueRenderOption=UNFORMATTED_VALUE`);
  const column = result.values || [];
  const index = column.findIndex((cell) => String(cell[0]) === String(id));
  if (index === -1) return false;

  // 헤더가 0번 행이므로 데이터 i번째는 시트 행 인덱스 i + 1
  const startIndex = index + 1;
  await sheetsFetch(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheetGids[tab],
              dimension: 'ROWS',
              startIndex,
              endIndex: startIndex + 1,
            },
          },
        },
      ],
    }),
  });
  return true;
}

module.exports = {
  configured,
  readRows,
  appendRow,
  deleteRowById,
  LOGS_TAB,
  EXERCISES_TAB,
};
