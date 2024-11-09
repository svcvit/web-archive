import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { isNil, isNotNil, isNumberString } from '@web-archive/shared/utils'
import type { HonoTypeUserInformation } from '~/constants/binding'
import result from '~/utils/result'
import { clearDeletedPage, deletePageById, getPageById, insertPage, queryDeletedPage, queryPage, queryRecentSavePage, restorePage, selectPageTotalCount, updatePage } from '~/model/page'
import { getFolderById, restoreFolder } from '~/model/folder'
import { getFileFromBucket, saveFileToBucket } from '~/utils/file'
import type { Page } from '~/sql/types'
import { updateShowcase } from '~/model/showcase'
import { updateBindPageByTagName } from '~/model/tag'

const app = new Hono<HonoTypeUserInformation>()

app.post(
  '/upload_new_page',
  validator('form', (value, c) => {
    if (!value.title || typeof value.title !== 'string') {
      return c.json(result.error(400, 'Title is required'))
    }
    if (value.pageDesc && typeof value.pageDesc !== 'string') {
      return c.json(result.error(400, 'Description should be a string'))
    }
    if (!value.pageUrl || typeof value.pageUrl !== 'string') {
      return c.json(result.error(400, 'URL is required'))
    }
    if (!value.pageFile) {
      return c.json(result.error(400, 'File is required'))
    }
    if (!value.folderId || !isNumberString(value.folderId)) {
      return c.json(result.error(400, 'FolderId id should be a number'))
    }

    if (isNotNil(value.bindTags)) {
      if (typeof value.bindTags !== 'string')
        return c.json(result.error(400, 'bindTags should be a string array'))
      try {
        const bindTags = JSON.parse(value.bindTags)
        if (!Array.isArray(bindTags))
          return c.json(result.error(400, 'bindTags should be a string array'))
      }
      catch (e) {
        return c.json(result.error(400, 'bindTags should be a string array'))
      }
    }

    return {
      title: value.title,
      pageDesc: value.pageDesc as string,
      pageUrl: value.pageUrl,
      pageFile: value.pageFile,
      folderId: Number(value.folderId),
      screenshot: value.screenshot,
      bindTags: JSON.parse(value.bindTags ?? '[]') as string[],
    }
  }),
  async (c) => {
    const { title, pageDesc = '', pageUrl, pageFile, folderId, screenshot, bindTags } = c.req.valid('form')

    // todo check folder exists?

    const [contentUrl, screenshotId] = await Promise.all([
      saveFileToBucket(c.env.BUCKET, pageFile),
      saveFileToBucket(c.env.BUCKET, screenshot),
    ])

    if (isNil(contentUrl)) {
      return c.json({ status: 'error', message: 'Failed to upload file' })
    }
    const insertId = await insertPage(c.env.DB, {
      title,
      pageDesc,
      pageUrl,
      contentUrl,
      folderId,
      screenshotId,
    })
    if (isNotNil(insertId)) {
      const updateTagResult = await updateBindPageByTagName(c.env.DB, bindTags.map(tagName => ({ tagName, pageIds: [insertId] })), [])
      if (updateTagResult)
        return c.json(result.success(null))
    }
    return c.json(result.error(500, 'Failed to insert page'))
  },
)

app.post(
  '/query',
  validator('json', (value, c) => {
    if (isNil(value.folderId) || !isNumberString(value.folderId)) {
      return c.json(result.error(400, 'Folder ID is required'))
    }

    if (isNotNil(value.tagId) && !isNumberString(value.tagId)) {
      return c.json(result.error(400, 'Tag ID should be a number'))
    }

    if (value.pageNumber && !isNumberString(value.pageNumber)) {
      return c.json(result.error(400, 'Page number should be a number'))
    }

    if (value.pageSize && !isNumberString(value.pageSize)) {
      return c.json(result.error(400, 'Page size should be a number'))
    }

    return {
      folderId: Number(value.folderId),
      tagId: isNotNil(value.tagId) ? Number(value.tagId) : undefined,
      pageNumber: isNotNil(value.pageNumber) ? Number(value.pageNumber) : undefined,
      pageSize: isNotNil(value.pageSize) ? Number(value.pageSize) : undefined,
      keyword: value.keyword,
    }
  }),
  async (c) => {
    const { folderId, pageNumber, pageSize, keyword, tagId } = c.req.valid('json')

    const [pages, total] = await Promise.all([
      queryPage(
        c.env.DB,
        { folderId, pageNumber, pageSize, keyword, tagId },
      ),
      selectPageTotalCount(c.env.DB, { folderId, keyword, tagId }),
    ])
    return c.json(result.success({ list: pages, total }))
  },
)

app.get('/recent_save', async (c) => {
  const pages = await queryRecentSavePage(c.env.DB)
  return c.json(result.success(pages))
})

app.get(
  '/detail',
  validator('query', (value, c) => {
    if (!value.id || Number.isNaN(Number(value.id))) {
      return c.json(result.error(400, 'ID is required'))
    }
    return {
      id: Number(value.id),
    }
  }),
  async (c) => {
    const { id } = c.req.valid('query')

    const page = await getPageById(c.env.DB, {
      id,
      isDeleted: false,
    })
    if (page) {
      return c.json(result.success(page))
    }

    return c.json(result.success(null))
  },
)

app.delete(
  '/delete_page',
  validator('query', (value, c) => {
    if (!value.id || Number.isNaN(Number(value.id))) {
      return c.json(result.error(400, 'ID is required'))
    }
    return {
      id: Number(value.id),
    }
  }),
  async (c) => {
    const { id } = c.req.valid('query')

    if (await deletePageById(c.env.DB, id)) {
      return c.json(result.success({ id }))
    }

    return c.json(result.error(500, 'Failed to delete page'))
  },
)

app.put(
  '/update_page',
  validator('json', (value, c) => {
    if (!value.id || Number.isNaN(Number(value.id))) {
      return c.json(result.error(400, 'ID is required'))
    }

    if (!isNumberString(value.folderId)) {
      return c.json(result.error(400, 'Folder ID should be a number'))
    }

    if (!value.title || typeof value.title !== 'string') {
      return c.json(result.error(400, 'Title is required'))
    }

    if (typeof value.isShowcased !== 'number') {
      return c.json(result.error(400, 'isShowcased is required'))
    }

    if (isNotNil(value.bindTags) && !Array.isArray(value.bindTags)) {
      return c.json(result.error(400, 'bindTags should be an array'))
    }

    if (isNotNil(value.unbindTags) && !Array.isArray(value.unbindTags)) {
      return c.json(result.error(400, 'removeTags should be an array'))
    }

    return {
      id: Number(value.id),
      folderId: Number(value.folderId),
      title: value.title,
      isShowcased: value.isShowcased,
      pageDesc: value.pageDesc ?? '',
      pageUrl: value.pageUrl ?? '',
      bindTags: value.bindTags as string[] ?? [],
      unbindTags: value.unbindTags as string[] ?? [],
    }
  }),
  async (c) => {
    const { id, folderId, title, isShowcased, pageDesc, pageUrl, bindTags, unbindTags } = c.req.valid('json')
    if (isNil(folderId))
      return c.json(result.success(null))

    const bindTagParams = bindTags.map(tagName => ({ tagName, pageIds: [id] }))
    const unbindTagParams = unbindTags.map(tagName => ({ tagName, pageIds: [id] }))
    const updateSuccess = await updatePage(c.env.DB, { id, folderId, title, isShowcased, pageDesc, pageUrl, bindTags: bindTagParams, unbindTags: unbindTagParams })
    if (updateSuccess)
      return c.json(result.success(null))

    return c.json(result.error(500, 'Failed to update page'))
  },
)

app.post(
  '/query_deleted',
  async (c) => {
    const pages = await queryDeletedPage(c.env.DB)
    return c.json(result.success(pages))
  },
)

app.post(
  '/restore_page',
  validator('json', (value, c) => {
    if (isNil(value.id) || !isNumberString(value.id)) {
      return c.json(result.error(400, 'ID is required and should be a number'))
    }

    if (isNotNil(value.folderId) && !isNumberString(value.folderId)) {
      return c.json(result.error(400, 'Folder ID should be a number'))
    }

    return {
      id: Number(value.id),
      folderId: isNotNil(value.folderId) ? Number(value.folderId) : undefined,
    }
  }),
  async (c) => {
    const { id, folderId } = c.req.valid('json')
    let pageFolderId = folderId
    if (isNil(pageFolderId)) {
      const page = await getPageById(c.env.DB, { id })
      if (isNil(page)) {
        return c.json(result.error(500, 'Page not found'))
      }

      pageFolderId = page.folderId
    }
    const folder = await getFolderById(c.env.DB, { id: pageFolderId })
    if (isNil(folder)) {
      return c.json(result.error(500, 'Folder not found'))
    }
    if (folder.isDeleted) {
      const restoreFolderResult = await restoreFolder(c.env.DB, pageFolderId)
      if (!restoreFolderResult) {
        return c.json(result.error(500, 'Failed to restore folder'))
      }
    }

    if (await restorePage(c.env.DB, id)) {
      return c.json(result.success(null))
    }

    return c.json(result.error(500, 'Failed to restore page'))
  },
)

app.delete(
  '/clear_deleted',
  async (c) => {
    if (await clearDeletedPage(c.env.DB)) {
      return c.json(result.success(null))
    }
  },
)

app.get('/content', async (c) => {
  const pageId = c.req.query('pageId')
  // redirect to 404
  if (!pageId) {
    return c.redirect('/error')
  }

  // todo refactor
  const pageListResult = await c.env.DB.prepare('SELECT * FROM pages WHERE isDeleted = 0 AND id = ?')
    .bind(pageId)
    .all()
  if (!pageListResult.success) {
    return c.redirect('/error')
  }

  const page = pageListResult.results?.[0] as Page
  if (!page) {
    return c.redirect('/error')
  }

  const content = await c.env.BUCKET.get(page.contentUrl)
  if (!content) {
    return c.redirect('/error')
  }

  return c.html(
    await content?.text(),
  )
})

app.put(
  '/update_showcase',
  validator('json', (value, c) => {
    if (!value.id || typeof value.id !== 'number') {
      return c.json(result.error(400, 'Page ID is required and should be a number'))
    }

    if (typeof value.isShowcased !== 'number') {
      return c.json(result.error(400, 'isShowcased is required and should be a number'))
    }

    return {
      id: value.id,
      isShowcased: value.isShowcased,
    }
  }),
  async (c) => {
    const { id, isShowcased } = c.req.valid('json')
    const updateResult = await updateShowcase(c.env.DB, { id, isShowcased })

    return c.json(result.success(updateResult))
  },
)

app.get(
  '/screenshot',
  validator('query', (value, c) => {
    if (isNil(value.id) || typeof value.id !== 'string') {
      return c.json(result.error(400, 'ID is required'))
    }

    return {
      id: value.id,
    }
  }),
  async (c) => {
    const { id } = c.req.valid('query')

    const screenshot = await getFileFromBucket(c.env.BUCKET, id)

    c.res.headers.set('Content-Type', 'image/webp')
    c.res.headers.set('cache-control', 'public, max-age=31536000')

    return c.body(await screenshot.arrayBuffer())
  },
)

export default app
