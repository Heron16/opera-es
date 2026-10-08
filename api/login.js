// POST /api/login
const { lerUsuarios, verificarSenha, gerarToken, setCors, parseBody } = require('./_lib/redis');

const DIAS_TROCA_SENHA = 30;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const body = await parseBody(req);
  const { username, password } = body;
  if (!username || !password)
    return res.status(400).json({ erro: 'Usuário e senha são obrigatórios' });

  const usuarios = await lerUsuarios();
  const usuario  = usuarios.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!usuario || !(await verificarSenha(password, usuario)))
    return res.status(401).json({ erro: 'Usuário ou senha incorretos' });

  const token = gerarToken(usuario);

  // Verifica se a senha precisa ser trocada (a cada 30 dias)
  let precisaTrocarSenha = false;
  if (!usuario.primeiroAcesso && usuario.ultimaTrocaSenha) {
    const diasDesdeUltimaTroca = (Date.now() - new Date(usuario.ultimaTrocaSenha).getTime()) / (1000 * 60 * 60 * 24);
    if (diasDesdeUltimaTroca >= DIAS_TROCA_SENHA) precisaTrocarSenha = true;
  } else if (!usuario.primeiroAcesso && !usuario.ultimaTrocaSenha) {
    // Nunca trocou a senha (usuário antigo sem registro) → pede troca
    precisaTrocarSenha = true;
  }

  return res.json({
    token,
    username: usuario.username,
    role: usuario.role,
    primeiroAcesso: !!usuario.primeiroAcesso,
    precisaTrocarSenha,
  });
};
