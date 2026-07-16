// POST /api/migrar — importa todos os dados do localStorage de uma vez
const { lerDados, salvarDados, verificarToken, setCors, parseBody } = require('./_lib/redis');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const usuario = verificarToken(req);
  if (!usuario) return res.status(401).json({ erro: 'Não autenticado' });

  const dadosNovos = await parseBody(req);
  if (typeof dadosNovos !== 'object' || Array.isArray(dadosNovos))
    return res.status(400).json({ erro: 'Formato inválido' });

  try {
    const existentes = await lerDados();
    const merged = { ...existentes, ...dadosNovos };
    await salvarDados(merged);
    return res.json({ ok: true, chaves: Object.keys(dadosNovos).length });
  } catch (e) {
    return res.status(500).json({ erro: 'Erro ao migrar dados' });
  }
};
