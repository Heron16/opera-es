// Debug temporário — apenas para admin
const { verificarToken, setCors } = require('./_lib/redis');

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const usuario = verificarToken(req);
  if (!usuario || usuario.role !== 'admin')
    return res.status(403).json({ erro: 'Apenas admin' });

  try {
    // Verifica o tipo da chave coamo:dados no Redis
    const tipoR = await fetch(`${REDIS_URL}/type/coamo:dados`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const tipo = await tipoR.json();

    // Tenta GET (string)
    const getR = await fetch(`${REDIS_URL}/get/coamo:dados`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const getJson = await getR.json();

    // Tenta HGETALL (hash)
    const hgetR = await fetch(`${REDIS_URL}/hgetall/coamo:dados`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const hgetJson = await hgetR.json();

    return res.json({
      tipo_chave: tipo.result,
      get_result: getJson.result ? String(getJson.result).substring(0, 200) : null,
      hgetall_campos: Array.isArray(hgetJson.result) ? hgetJson.result.length / 2 + ' campos' : hgetJson.result,
      hgetall_primeiros: Array.isArray(hgetJson.result) ? hgetJson.result.slice(0, 10) : null,
    });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
};
