// POST /api/trocar-senha
const bcrypt = require('bcryptjs');
const { lerUsuarios, salvarUsuarios, verificarToken, setCors } = require('./_lib/redis');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const usuario = verificarToken(req);
  if (!usuario) return res.status(401).json({ erro: 'Não autenticado' });

  const { novaSenha } = req.body || {};
  if (!novaSenha) return res.status(400).json({ erro: 'Nova senha obrigatória' });

  const forte = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(novaSenha);
  if (!forte)
    return res.status(400).json({
      erro: 'A senha deve ter no mínimo 8 caracteres com letra maiúscula, minúscula, número e caractere especial.',
    });

  const usuarios = await lerUsuarios();
  const idx = usuarios.findIndex(u => u.username === usuario.username);
  if (idx === -1) return res.status(404).json({ erro: 'Usuário não encontrado' });

  usuarios[idx].passwordHash = bcrypt.hashSync(novaSenha, 10);
  delete usuarios[idx].password;
  delete usuarios[idx].primeiroAcesso;

  // Persiste no Redis (único storage disponível no Vercel)
  await salvarUsuarios(usuarios);

  return res.json({ ok: true });
};
