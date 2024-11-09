import type { Tag } from '@web-archive/shared/types'
import fetcher from '~/utils/fetcher'

function getAllTag(): Promise<Tag[]> {
  return fetcher<Tag[]>('/tags/all', {
    method: 'GET',
  })
}

function deleteTag(tagId: number): Promise<void> {
  return fetcher<void>(`/tags/delete`, {
    method: 'DELETE',
    query: { id: tagId.toString() },
  })
}

function updateTag(body: { id: number, name: string }): Promise<void> {
  return fetcher<void>(`/tags/update`, {
    method: 'POST',
    body,
  })
}

export {
  getAllTag,
  deleteTag,
  updateTag,
}
