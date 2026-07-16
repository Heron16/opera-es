// POST /api/login
const { lerUsuarios, verificarSenha, gerarToken, setCors, parseBody } = require('./_lib/redis');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const body = await parseBody(req);
  const { username, password } = body;
  if (!username || !password)
    return res.status(400).json({ erro: 'Usuário e senha são obrigatórios' });

  const usuarios = await lerUsuarios();
  // Busca ignorando maiúsculas/minúsculas
  const usuario  = usuarios.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!usuario || !(await verificarSenha(password, usuario)))
    return res.status(401).json({ erro: 'Usuário ou senha incorretos' });

  const token = gerarToken(usuario);
  return res.json({
    token,
    username: usuario.username,
    role: usuario.role,
    primeiroAcesso: !!usuario.primeiroAcesso,
  });
};
