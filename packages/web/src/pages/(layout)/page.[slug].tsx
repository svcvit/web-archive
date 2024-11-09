import { Button } from '@web-archive/shared/components/button'
import { useRequest } from 'ahooks'
import { ArrowLeft, Trash } from 'lucide-react'
import { useContext, useEffect } from 'react'
import IframePageContent from '~/components/iframe-page-content'
import LoadingWrapper from '~/components/loading-wrapper'
import ReadabilityPageContent from '~/components/readability-page-content'
import { deletePage, getPageDetail } from '~/data/page'
import { useNavigate, useParams } from '~/router'
import AppContext from '~/store/app'

async function getPageContent(pageId: string | undefined) {
  if (!pageId)
    return ''
  const url = `/api/pages/content?pageId=${pageId}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'text/html',
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    },
  })
  return await res.text()
}

function ArchivePage() {
  const navigate = useNavigate()
  const { slug } = useParams('/page/:slug')

  useEffect(() => {
    if (!slug) {
      navigate('/')
    }
  })

  const { data: pageDetail } = useRequest(
    getPageDetail,
    {
      onSuccess: (pageDetail) => {
        if (!pageDetail) {
          navigate('/error/:slug', { params: { slug: '404' } })
        }
      },
      defaultParams: [slug],
    },
  )

  const goBack = () => {
    if (pageDetail)
      navigate('/folder/:slug', { params: { slug: String(pageDetail?.folderId) } })
    else
      window.history.back()
  }

  const { data: pageContentUrl, loading: pageLoading } = useRequest(async () => {
    const pageHtml = await getPageContent(slug)
    return pageHtml
  })
  useEffect(() => {
    return () => {
      pageContentUrl && URL.revokeObjectURL(pageContentUrl)
    }
  }, [pageContentUrl])

  const { runAsync: runDeletePage } = useRequest(
    deletePage,
    {
      manual: true,
    },
  )
  const handleDeletePage = async () => {
    if (!window.confirm('Are you sure you want to delete this page?'))
      return
    if (!pageDetail)
      return
    await runDeletePage(pageDetail)
    goBack()
  }

  const { readMode, setReadMode } = useContext(AppContext)

  return (
    <main className="h-screen flex flex-col">
      <nav className="p-2 flex justify-between items-center">
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex space-x-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setReadMode(!readMode)}
          >
            {readMode ? 'open Iframe mode' : 'open Read mode'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeletePage}
          >
            <Trash className="w-5 h-5" />
          </Button>
        </div>
      </nav>
      <div className="flex-1 p-4">
        <LoadingWrapper loading={pageLoading}>
          {readMode
            ? <ReadabilityPageContent pageHtml={pageContentUrl || ''} />
            : <IframePageContent pageHtml={pageContentUrl || ''} />}
        </LoadingWrapper>
      </div>
    </main>
  )
}

export default ArchivePage
