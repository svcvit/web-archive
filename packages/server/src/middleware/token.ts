import type { Context, Next } from 'hono'
import { verifyAdminToken } from '~/model/store'

async function tokenMiddleware(c: Context, next: Next) {
  if (c.req.path === '/api/pages/screenshot') {
    return await next()
  }

  const authHeader = c.req.header('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Invalid token' }, 401)
  }

  const token = authHeader.split(' ')[1]

  const result = await verifyAdminToken(c.env.DB, token)

  if (result === 'reject') {
    return c.json({ error: 'Invalid token' }, 401)
  }

  if (result === 'fail') {
    return c.json({ error: 'Admin token set failed' }, 401)
  }

  if (result === 'new') {
    return c.json({ error: 'Admin token set, please use it login again' }, 201)
  }

  await next()
}

export default tokenMiddleware
