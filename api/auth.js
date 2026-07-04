import jwt from 'jsonwebtoken'
import { parseBody } from './_db.js'

// Login do administrador único. Compara username/password com ADMIN_USER/ADMIN_PASS e, se
// corretos, devolve um JWT válido por 8h. Credenciais e segredo vêm apenas do ambiente
// (configurados manualmente no Vercel) — nunca do código.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const secret = process.env.JWT_SECRET
  const adminUser = process.env.ADMIN_USER
  const adminPass = process.env.ADMIN_PASS
  if (!secret || !adminUser || !adminPass) {
    return res.status(500).json({ error: 'Auth not configured' })
  }

  try {
    const { username, password } = await parseBody(req)
    if (username !== adminUser || password !== adminPass) {
      return res.status(401).json({ error: 'Credenciais inválidas' })
    }
    const token = jwt.sign({ user: adminUser, role: 'admin' }, secret, { expiresIn: '8h' })
    return res.json({ token })
  } catch (err) {
    console.error('[api/auth]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
