// POST /api/admin-usuarios — sincroniza lista de usuários no Redis (apenas admin)
// GET  /api/admin-usuarios?lista=1 — retorna lista de usuários sem senhas
const { lerUsuarios, salvarUsuarios, verificarToken, setCors, parseBody } = require('./_lib/redis');

const NOVOS_USUARIOS = [
  { username: 'hsilva',       password: '123456', role: 'operador', primeiroAcesso: true },
  { username: 'chcarvalho',   password: '123456', role: 'operador', primeiroAcesso: true },
  { username: 'vitorsilva',   password: '123456', role: 'operador', primeiroAcesso: true },
  { username: 'vhonorato',    password: '123456', role: 'operador', primeiroAcesso: true },
  { username: 'adolinek',     password: '123456', role: 'operador', primeiroAcesso: true },
  { username: 'eduardosilva', password: '123456', role: 'operador', primeiroAcesso: true },
  { username: 'coliveira',    password: '123456', role: 'operador', primeiroAcesso: true },
  { username: 'eklein',       password: '123456', role: 'operador', primeiroAcesso: true },
  { username: 'mmartins',     password: '123456', role: 'operador', primeiroAcesso: true },
  { username: 'phdias',       password: '123456', role: 'operador', primeiroAcesso: true },
];

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const admin = verificarToken(req);
  if (!admin) return res.status(401).json({ erro: 'Não autenticado' });
  if (admin.role !== 'admin') return res.status(403).json({ erro: 'Apenas administradores' });

  // GET — retorna lista sem senhas
  if (req.method === 'GET') {
    const usuarios = await lerUsuarios();
    return res.json({
      usuarios: usuarios.map(u => ({
        username: u.username,
        role: u.role,
        primeiroAcesso: !!u.primeiroAcesso,
      }))
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  try {
    const existentes = await lerUsuarios();

    // Adiciona apenas usuários que ainda não existem (preserva senhas já trocadas)
    const adicionados = [];
    for (const novo of NOVOS_USUARIOS) {
      const jaExiste = existentes.some(
        u => u.username.toLowerCase() === novo.username.toLowerCase()
      );
      if (!jaExiste) {
        existentes.push(novo);
        adicionados.push(novo.username);
      }
    }

    await salvarUsuarios(existentes);
    return res.json({
      ok: true,
      totalUsuarios: existentes.length,
      adicionados,
      mensagem: adicionados.length > 0
        ? `${adicionados.length} usuário(s) adicionado(s): ${adicionados.join(', ')}`
        : 'Todos os usuários já existiam no Redis.',
    });
  } catch (e) {
    return res.status(500).json({ erro: 'Erro ao atualizar usuários: ' + e.message });
  }
};
