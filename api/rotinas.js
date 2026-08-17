// GET  /api/rotinas  — retorna customizações de rotinas
// POST /api/rotinas  — salva customizações (apenas admin)
const { lerDados, salvarDados, verificarToken, setCors, parseBody } = require('./_lib/redis');

const CHAVE = 'rotinas_custom';

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const usuario = verificarToken(req);
  if (!usuario) return res.status(401).json({ erro: 'Não autenticado' });

  if (req.method === 'GET') {
    const dados = await lerDados();
    const raw = dados[CHAVE];
    try {
      return res.json(raw ? JSON.parse(raw) : {});
    } catch {
      return res.json({});
    }
  }

  if (req.method === 'POST') {
    if (usuario.role !== 'admin')
      return res.status(403).json({ erro: 'Apenas administradores podem gerenciar rotinas.' });

    const body = await parseBody(req);
    if (typeof body !== 'object' || Array.isArray(body))
      return res.status(400).json({ erro: 'Formato inválido' });

    try {
      const dados = await lerDados();
      dados[CHAVE] = JSON.stringify(body);
      await salvarDados(dados);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ erro: 'Erro ao salvar: ' + e.message });
    }
  }

  return res.status(405).json({ erro: 'Método não permitido' });
};
