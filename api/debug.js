// Debug completo
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const info = {
    tem_url:   !!REDIS_URL,
    tem_token: !!REDIS_TOKEN,
    url_inicio: REDIS_URL ? REDIS_URL.substring(0, 40) + '...' : 'NÃO CONFIGURADA',
  };

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.json({ ...info, erro: 'Variáveis não configuradas' });
  }

  // Testa ping simples no Redis
  try {
    const r = await fetch(`${REDIS_URL}/ping`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const txt = await r.text();
    info.ping_status = r.status;
    info.ping_resposta = txt;
  } catch(e) {
    info.ping_erro = e.message;
    info.ping_causa = e.cause ? String(e.cause) : undefined;
  }

  // Testa GET simples
  try {
    const r2 = await fetch(`${REDIS_URL}/get/teste`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    info.get_status = r2.status;
    info.get_resposta = await r2.text();
  } catch(e) {
    info.get_erro = e.message;
  }

  return res.json(info);
};
