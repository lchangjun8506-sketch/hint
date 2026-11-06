// GET /api/logs            -> 전체 운동 일지 (최신순)
// POST /api/logs           -> 일지 추가 { date, routine, exercise, sets, memo }
// DELETE /api/logs?id=...  -> 일지 삭제
const { configured, readRows, appendRow, deleteRowById, LOGS_TAB } = require('./_sheets');

const ROUTINES = ['가슴·삼두', '등·이두', '어깨', '하체'];
const ID_PATTERN = /^[A-Za-z0-9_]{1,64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidNumber(n) {
  return Number.isFinite(n) && n >= 0 && n <= 1000;
}

function sanitizeSets(sets) {
  if (!Array.isArray(sets) || sets.length === 0 || sets.length > 30) return null;
  const result = [];
  for (const s of sets) {
    const weight = Number(s && s.weight);
    const reps = Number(s && s.reps);
    if (!isValidNumber(weight) || !isValidNumber(reps)) return null;
    const set = { weight, reps };
    if (Array.isArray(s.drops) && s.drops.length > 0) {
      const drops = [];
      for (const d of s.drops.slice(0, 10)) {
        const dw = Number(d && d.weight);
        const dr = Number(d && d.reps);
        if (!isValidNumber(dw) || !isValidNumber(dr)) return null;
        drops.push({ weight: dw, reps: dr });
      }
      set.drops = drops;
    }
    result.push(set);
  }
  return result;
}

function parseLog(row) {
  let sets = [];
  try {
    sets = JSON.parse(row[4] || '[]');
  } catch (e) {
    sets = [];
  }
  sets = (Array.isArray(sets) ? sets : []).map((s) => {
    const set = { weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 };
    if (Array.isArray(s.drops) && s.drops.length > 0) {
      set.drops = s.drops.map((d) => ({ weight: Number(d.weight) || 0, reps: Number(d.reps) || 0 }));
    }
    return set;
  });
  return {
    id: String(row[0] || ''),
    date: String(row[1] || ''),
    routine: String(row[2] || ''),
    exercise: String(row[3] || ''),
    sets,
    memo: String(row[5] || ''),
    createdAt: String(row[6] || ''),
  };
}

function newId() {
  return 'LOG_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (!configured()) {
    return res.status(503).json({ error: 'not_configured' });
  }

  try {
    if (req.method === 'GET') {
      const rows = await readRows(LOGS_TAB, 'G');
      const logs = rows
        .map(parseLog)
        .filter((l) => l.id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
      return res.status(200).json({ logs });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const exercise = String(body.exercise || '').trim();
      const sets = sanitizeSets(body.sets);
      if (
        !DATE_PATTERN.test(String(body.date || '')) ||
        !ROUTINES.includes(body.routine) ||
        exercise.length === 0 ||
        exercise.length > 100 ||
        !sets
      ) {
        return res.status(400).json({ error: 'invalid_input' });
      }

      const log = {
        id: newId(),
        date: body.date,
        routine: body.routine,
        exercise,
        sets,
        memo: String(body.memo || '').slice(0, 500),
        createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
      };
      await appendRow(LOGS_TAB, 'G', [
        log.id,
        log.date,
        log.routine,
        log.exercise,
        JSON.stringify(log.sets),
        log.memo,
        log.createdAt,
      ]);
      return res.status(201).json({ log });
    }

    if (req.method === 'DELETE') {
      const id = String((req.query && req.query.id) || '');
      if (!ID_PATTERN.test(id)) return res.status(400).json({ error: 'invalid_id' });
      const deleted = await deleteRowById(LOGS_TAB, id);
      return res.status(deleted ? 200 : 404).json({ ok: deleted });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    console.error('logs api error:', err.message);
    return res.status(500).json({ error: 'server_error' });
  }
};
