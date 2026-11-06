// GET /api/exercises   -> 사용자가 추가한 운동 종목 목록
// POST /api/exercises  -> 종목 추가 { routine, exercise }
const { configured, readRows, appendRow, EXERCISES_TAB } = require('./_sheets');

const ROUTINES = ['가슴·삼두', '등·이두', '어깨', '하체'];

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (!configured()) {
    return res.status(503).json({ error: 'not_configured' });
  }

  try {
    if (req.method === 'GET') {
      const rows = await readRows(EXERCISES_TAB, 'B');
      const exercises = rows
        .map((r) => ({ routine: String(r[0] || ''), exercise: String(r[1] || '') }))
        .filter((e) => e.routine && e.exercise);
      return res.status(200).json({ exercises });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const exercise = String(body.exercise || '').trim();
      if (!ROUTINES.includes(body.routine) || exercise.length === 0 || exercise.length > 100) {
        return res.status(400).json({ error: 'invalid_input' });
      }

      const rows = await readRows(EXERCISES_TAB, 'B');
      const exists = rows.some((r) => r[0] === body.routine && r[1] === exercise);
      if (!exists) await appendRow(EXERCISES_TAB, 'B', [body.routine, exercise]);
      return res.status(201).json({ exercise: { routine: body.routine, exercise } });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    console.error('exercises api error:', err.message);
    return res.status(500).json({ error: 'server_error' });
  }
};
