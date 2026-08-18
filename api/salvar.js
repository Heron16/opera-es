// POST /api/salvar — salva uma chave individual
const { lerDados, salvarDados, verificarToken, setCors, parseBody } = require('./_lib/redis');

// Salva diretamente no Redis com HSET (hash) para evitar race condition
// Cada chave do dashboard é um campo do hash 'coamo:dados'
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisHSet(campo, valor) {
  if (!REDIS_URL || !REDIS_TOKEN) return false;
  try {
    const r = await fetch(`${REDIS_URL}/hset/coamo:dados`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([campo, valor]),
    });
    return r.ok;
  } catch { return false; }
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const usuario = verificarToken(req);
  if (!usuario) return res.status(401).json({ erro: 'Não autenticado' });

  let body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    body = await parseBody(req);
  }

  const chave = body.chave;
  const valor = body.valor;

  if (!chave) return res.status(400).json({ erro: 'Chave obrigatória', body_recebido: JSON.stringify(body).substring(0,200) });

  if (chave.startsWith('horarios_') && usuario.role !== 'admin')
    return res.status(403).json({ erro: 'Apenas administradores podem editar horários.' });

  try {
    // Tenta salvar diretamente via HSET (atômico, sem race condition)
    const ok = await redisHSet(chave, valor);
    if (ok) return res.json({ ok: true });

    // Fallback: método antigo (lê tudo e salva tudo)
    const dados = await lerDados();
    dados[chave] = valor;
    await salvarDados(dados);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ erro: 'Erro ao salvar: ' + e.message });
  }
};
