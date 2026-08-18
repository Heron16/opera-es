// Debug temporário — aceita token via query string ou header
const { setCors } = require('./_lib/redis');
const jwt = require('jsonwebtoken');

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const JWT_SECRET  = process.env.JWT_SECRET || 'coamo-dev-local-nao-usar-em-producao';

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Aceita token via header Authorization ou via query string ?t=...
  const headerToken = (req.headers['authorization'] || '').replace('Bearer ', '');
  const queryToken  = (req.query && req.query.t) || '';
  const token = headerToken || queryToken;

  let usuario = null;
  try { usuario = jwt.verify(token, JWT_SECRET); } catch {}
  if (!usuario || usuario.role !== 'admin')
    return res.status(403).json({ erro: 'Apenas admin. Passe o token: /api/debug?t=SEU_TOKEN' });

  try {
    const tipoR = await fetch(`${REDIS_URL}/type/coamo:dados`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const tipo = (await tipoR.json()).result;

    let info = { tipo_chave: tipo };

    if (tipo === 'string') {
      const getR = await fetch(`${REDIS_URL}/get/coamo:dados`, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      });
      const raw = (await getR.json()).result;
      info.formato = 'STRING (formato antigo)';
      info.tamanho_bytes = raw ? raw.length : 0;
      try {
        const obj = JSON.parse(raw);
        info.num_chaves = Object.keys(obj).length;
        info.primeiras_chaves = Object.keys(obj).slice(0, 5);
      } catch { info.parse_erro = true; }

    } else if (tipo === 'hash') {
      const hgetR = await fetch(`${REDIS_URL}/hgetall/coamo:dados`, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      });
      const arr = (await hgetR.json()).result;
      info.formato = 'HASH (formato novo)';
      info.num_campos = Array.isArray(arr) ? arr.length / 2 : 0;
      info.primeiros_campos = Array.isArray(arr) ? arr.filter((_,i) => i % 2 === 0).slice(0, 5) : [];

    } else {
      info.formato = 'CHAVE NÃO EXISTE ou tipo desconhecido';
    }

    return res.json(info);
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
};
