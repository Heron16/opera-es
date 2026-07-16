// POST /api/salvar — salva uma chave individual
const { lerDados, salvarDados, verificarToken, setCors, parseBody } = require('./_lib/redis');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const usuario = verificarToken(req);
  if (!usuario) return res.status(401).json({ erro: 'Não autenticado' });

  // Tenta req.body primeiro (Vercel pode já parsear), senão usa parseBody
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
    const dados = await lerDados();
    dados[chave] = valor;
    await salvarDados(dados);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ erro: 'Erro ao salvar: ' + e.message });
  }
};
