// POST /api/resetar-senha — admin reseta senha de um usuário para 123456 (primeiroAcesso)
const { lerUsuarios, salvarUsuarios, verificarToken, setCors, parseBody } = require('./_lib/redis');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const admin = verificarToken(req);
  if (!admin) return res.status(401).json({ erro: 'Não autenticado' });
  if (admin.role !== 'admin') return res.status(403).json({ erro: 'Apenas administradores' });

  const body = await parseBody(req);
  const { username } = body;
  if (!username) return res.status(400).json({ erro: 'Username obrigatório' });

  const usuarios = await lerUsuarios();
  const idx = usuarios.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
  if (idx === -1) return res.status(404).json({ erro: 'Usuário não encontrado' });

  // Não permite resetar a própria senha pelo painel (usa trocar-senha para isso)
  if (usuarios[idx].username.toLowerCase() === admin.username.toLowerCase()) {
    return res.status(400).json({ erro: 'Use "Alterar Senha" para redefinir sua própria senha.' });
  }

  // Reseta para senha padrão + marca como primeiro acesso
  usuarios[idx].password = '123456';
  delete usuarios[idx].passwordHash;
  delete usuarios[idx].ultimaTrocaSenha;
  usuarios[idx].primeiroAcesso = true;

  await salvarUsuarios(usuarios);
  return res.json({ ok: true, mensagem: `Senha de ${usuarios[idx].username} redefinida para 123456.` });
};
