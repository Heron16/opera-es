// Debug completo — testa save e read no Redis
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const jwt = require('jsonwebtoken');
const JWT_SECRET  = process.env.JWT_SECRET || 'coamo-dev-local-nao-usar-em-producao';
const { setCors, lerDados } = require('./_lib/redis');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Content-Type', 'application/json');

  // Aceita token via header Authorization OU via query param ?t=
  let usuario = null;
  try {
    const header = req.headers['authorization'] || '';
    const tokenHeader = header.startsWith('Bearer ') ? header.slice(7) : null;
    const tokenQuery  = req.query && req.query.t ? req.query.t : null;
    const token = tokenHeader || tokenQuery;
    if (token) usuario = jwt.verify(token, JWT_SECRET);
  } catch {}
  if (!usuario) return res.status(401).json({ erro: 'Não autenticado' });

  const info = {
    ts: new Date().toISOString(),
    usuario: usuario.username,
    redis_url_inicio: REDIS_URL ? REDIS_URL.substring(0, 50) : null,
  };

  // 1. Testa HSET diretamente (escreve uma chave de teste)
  const chaveHash = 'coamo:dados';
  const campoTeste = 'debug_teste';
  const valorTeste = JSON.stringify({ ts: Date.now(), ok: true });

  try {
    // Formato correto Upstash: array flat [campo, valor, campo, valor...]
    const bodyHset = JSON.stringify([campoTeste, valorTeste]);
    const r = await fetch(`${REDIS_URL}/hset/${encodeURIComponent(chaveHash)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: bodyHset
    });
    const txt = await r.text();
    info.hset_status = r.status;
    info.hset_ok     = r.ok;
    info.hset_body_enviado = bodyHset;
    info.hset_resposta = txt;
  } catch(e) {
    info.hset_erro = e.message;
  }

  // 2. Testa HGETALL logo depois
  try {
    const r2 = await fetch(`${REDIS_URL}/hgetall/${encodeURIComponent(chaveHash)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    const txt2 = await r2.text();
    info.hgetall_status   = r2.status;
    info.hgetall_ok       = r2.ok;
    info.hgetall_resposta = txt2.substring(0, 500);
  } catch(e) {
    info.hgetall_erro = e.message;
  }

  // 3. Lê via lerDados (caminho que o polling usa)
  try {
    const dados = await lerDados();
    info.lerdados_total_chaves = Object.keys(dados).length;
    info.lerdados_chaves = Object.keys(dados).slice(0, 20);
  } catch(e) {
    info.lerdados_erro = e.message;
  }

  return res.json(info);
};
