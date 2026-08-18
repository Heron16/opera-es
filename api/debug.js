// Debug completo — mostra estado real do Redis e última requisição
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const { verificarToken, setCors, lerDados } = require('./_lib/redis');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Content-Type', 'application/json');

  const usuario = verificarToken(req);
  if (!usuario) return res.status(401).json({ erro: 'Não autenticado' });

  const info = {
    ts: new Date().toISOString(),
    usuario: usuario.username,
    tem_url:   !!REDIS_URL,
    tem_token: !!REDIS_TOKEN,
  };

  // Ping Redis
  try {
    const r = await fetch(`${REDIS_URL}/ping`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    info.ping_ok = r.ok;
    info.ping_status = r.status;
  } catch(e) {
    info.ping_erro = e.message;
  }

  // Lê dados reais do Redis (igual ao /api/dados)
  try {
    const dados = await lerDados();
    const chaves = Object.keys(dados);
    info.total_chaves = chaves.length;
    info.chaves = chaves;

    // Mostra apenas chaves de status do dia de hoje e ontem
    const hoje = new Date();
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
    const chaveHoje  = 'status_diaria_' + fmt(hoje);
    const chaveOntem = 'status_diaria_' + fmt(ontem);

    info.status_hoje  = dados[chaveHoje]  ? JSON.parse(dados[chaveHoje])  : null;
    info.status_ontem = dados[chaveOntem] ? JSON.parse(dados[chaveOntem]) : null;
    info.chave_hoje   = chaveHoje;
    info.chave_ontem  = chaveOntem;
  } catch(e) {
    info.erro_dados = e.message;
  }

  return res.json(info);
};
