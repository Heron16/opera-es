// POST /api/salvar — salva uma chave individual
const { lerDados, salvarDados, verificarToken, setCors, parseBody } = require('./_lib/redis');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const usuario = verificarToken(req);
  if (!usuario) return res.status(401).json({ erro: 'Não autenticado' });

  const body = await parseBody(req);
  const { chave, valor } = body;
  if (!chave) return res.status(400).json({ erro: 'Chave obrigatória' });

  if (chave.startsWith('horarios_') && usuario.role !== 'admin')
    return res.status(403).json({ erro: 'Apenas administradores podem editar horários.' });

  try {
    const dados = await lerDados();
    dados[chave] = valor;
    await salvarDados(dados);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ erro: 'Erro ao salvar: ' + e.message });
  }
};
