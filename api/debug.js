// GET /api/debug — diagnóstico temporário (remover depois)
const { lerDados, salvarDados, verificarToken, setCors, parseBody } = require('./_lib/redis');

module.exports = async function handler(req, res) {
  setCors(res);

  const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  // Testa SET direto no Redis
  let setResult = null;
  let getResult = null;
  let dadosResult = null;
  let erroSet = null;
  let erroGet = null;

  try {
    const r = await fetch(`${REDIS_URL}/set/debug_test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'ok_' + Date.now() })
    });
    setResult = await r.json();
  } catch(e) { erroSet = e.message; }

  try {
    const r = await fetch(`${REDIS_URL}/get/debug_test`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    getResult = await r.json();
  } catch(e) { erroGet = e.message; }

  // Testa lerDados
  try {
    dadosResult = await lerDados();
  } catch(e) { dadosResult = 'ERRO: ' + e.message; }

  return res.json({
    redisUrl: REDIS_URL ? REDIS_URL.substring(0, 30) + '...' : 'NÃO DEFINIDO',
    redisToken: REDIS_TOKEN ? 'OK (' + REDIS_TOKEN.length + ' chars)' : 'NÃO DEFINIDO',
    setResult,
    erroSet,
    getResult,
    erroGet,
    qtdChavesSalvas: typeof dadosResult === 'object' ? Object.keys(dadosResult).length : dadosResult,
  });
};
