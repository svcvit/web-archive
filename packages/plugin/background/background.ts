import Browser from 'webextension-polyfill'
import '~/lib/browser-polyfill.min.js'
import '~/lib/single-file-background.js'
import { onMessage } from 'webext-bridge/background'
import { isNotNil } from '@web-archive/shared/utils'
import { clearFinishedTaskList, createAndRunTask, getTaskList } from './processor'
import { checkLoginStatus, getCacheLoginStatus, resetLoginStatus } from './login'

Browser.runtime.onInstalled.addListener(async () => {
  const tags = await Browser.tabs.query({})

  // inject content script to all tabs when installed
  tags
    .filter(tag => isNotNil(tag.id))
    .forEach(async (tag) => {
      try {
        console.log('inject content when installed', tag.title)
        await Browser.scripting.executeScript({
          target: { tabId: tag.id! },
          files: ['lib/browser-polyfill.min.js', 'contentScripts/main.js'],
        })
      }
      catch (e) {
        // ignore inject error
      }
    })
})

async function appendAuthHeader(options?: RequestInit) {
  const { token } = await Browser.storage.local.get('token') ?? {}
  if (!options) {
    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  }

  options.headers = Object.assign(options?.headers ?? {}, {
    Authorization: `Bearer ${token}`,
  })
  return options
}

/* global RequestInit */
export async function request(url: string, options?: RequestInit | undefined) {
  const { serverUrl } = await Browser.storage.local.get('serverUrl')
  const res = await fetch(`${serverUrl}/api${url}`, {
    credentials: 'same-origin',
    ...await appendAuthHeader(options),
  })
  if (res.ok) {
    const json = await res.json()
    if (json.code === 200) {
      return json.data
    }

    throw new Error(json.message)
  }

  if (res.status === 401) {
    await Browser.storage.local.set({ loginStatus: false })
    throw new Error('Unauthorized')
  }

  throw new Error('Failed to fetch')
}

onMessage('set-server-url', async ({ data: { url } }) => {
  const serverUrl = url.endsWith('/') ? url.slice(0, -1) : url
  await Browser.storage.local.set({ serverUrl })
  return {
    success: true,
  }
})
onMessage('get-server-url', async () => {
  const { serverUrl } = await Browser.storage.local.get('serverUrl')
  return { serverUrl }
})

onMessage('check-auth', async () => {
  return {
    success: await getCacheLoginStatus(),
  }
})

onMessage('login', async () => {
  return {
    success: await checkLoginStatus(),
  }
})

onMessage('logout', async () => {
  await resetLoginStatus()
})

onMessage('get-token', async () => {
  const { token } = await Browser.storage.local.get('token')
  return { token }
})

onMessage('set-token', async ({ data: { token } }) => {
  await Browser.storage.local.set({ token })
  return { success: true }
})

onMessage('get-all-folders', async () => {
  const folders = await request('/folders/all', {
    method: 'GET',
  })
  return {
    folders,
  }
})

onMessage('get-all-tags', async () => {
  const tags = await request('/tags/all', {
    method: 'GET',
  })
  return {
    tags,
  }
})

onMessage('add-save-page-task', async ({ data: { tabId, singleFileSetting, pageForm } }) => {
  createAndRunTask({
    tabId,
    singleFileSetting,
    pageForm,
  })
})

onMessage('get-page-task-list', async () => {
  return {
    taskList: await getTaskList(),
  }
})

onMessage('clear-finished-task-list', async () => {
  await clearFinishedTaskList()
})

onMessage('scrape-available', async ({ data: { tabId } }) => {
  try {
    await Browser.scripting.executeScript({
      target: { tabId },
      func: () => {
        console.log('web-archive-scrape-available')
      },
    })
    return { available: true }
  }
  catch (e) {
    return { available: false }
  }
})
