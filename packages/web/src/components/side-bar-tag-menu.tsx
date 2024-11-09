import { Badge } from '@web-archive/shared/components/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@web-archive/shared/components/collapsible'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@web-archive/shared/components/context-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuSub } from '@web-archive/shared/components/side-bar'
import type { Tag } from '@web-archive/shared/types'
import { cn } from '@web-archive/shared/utils'
import { useRequest } from 'ahooks'
import { ChevronDown, Pencil, TagIcon, Trash } from 'lucide-react'
import { useContext, useState } from 'react'
import toast from 'react-hot-toast'
import EditTagDialog from './edit-tag-dialog'
import { deleteTag } from '~/data/tag'
import AppContext from '~/store/app'

interface SidebarTagMenuProps {
  selectedTag: number | null
  setSelectedTag: (tag: number | null) => void
}

interface TagBadgeProps {
  tag: Tag
  isSelected: boolean
  onClick: () => void
  onDelete: () => void
  onEdit: () => void
}

function TagBadge({ tag, isSelected, onClick, onDelete, onEdit }: TagBadgeProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Badge
          key={tag.id}
          className="cursor-pointer h-fit mr-[3px] select-none"
          variant={isSelected ? 'default' : 'secondary'}
          onClick={onClick}
        >
          {tag.name}
        </Badge>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem
          className="flex items-center space-x-2 cursor-pointer"
          onClick={onEdit}
        >
          <Pencil size={12} />
          <div>Edit</div>
        </ContextMenuItem>
        <ContextMenuItem
          className="flex items-center space-x-2 cursor-pointer"
          onClick={onDelete}
        >
          <Trash size={12} />
          <div>Delete</div>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function SidebarTagMenu({ selectedTag, setSelectedTag }: SidebarTagMenuProps) {
  const { tagCache: tags, refreshTagCache } = useContext(AppContext)
  const [isTagsCollapseOpen, setIsTagsCollapseOpen] = useState(false)

  const handleClickTag = (tagId: number) => {
    if (selectedTag === tagId) {
      setSelectedTag(null)
    }
    else {
      setSelectedTag(tagId)
    }
  }

  const { run: runDelete } = useRequest(deleteTag, {
    manual: true,
    onSuccess() {
      refreshTagCache()
    },
    onError(error) {
      toast.error(error.message)
    },
  })

  const [editTagDialogOpen, setEditTagDialogOpen] = useState(false)
  const [editTag, setEditTag] = useState<Tag>()
  const handleEditTag = (tag: Tag) => {
    setEditTagDialogOpen(true)
    setEditTag(tag)
  }

  return (
    <SidebarMenu>
      <EditTagDialog editTag={editTag} afterSubmit={refreshTagCache} open={editTagDialogOpen} setOpen={setEditTagDialogOpen}></EditTagDialog>
      <Collapsible
        open={isTagsCollapseOpen}
        onOpenChange={setIsTagsCollapseOpen}
      >
        <CollapsibleTrigger asChild>
          <SidebarMenuButton className="w-full justify-between">
            <div className="flex items-center">
              <TagIcon className="mr-2 h-4 w-4"></TagIcon>
              Tags
            </div>
            <ChevronDown className={cn('h-4 w-4 transition-transform', isTagsCollapseOpen && 'rotate-180')} />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub
            onContextMenu={e => e.preventDefault()}
          >
            <div className="space-y-2">
              {tags?.map(tag => (
                <TagBadge
                  key={tag.id}
                  tag={tag}
                  isSelected={selectedTag === tag.id}
                  onClick={() => handleClickTag(tag.id)}
                  onDelete={() => { runDelete(tag.id) }}
                  onEdit={() => { handleEditTag(tag) }}
                />
              ))}
            </div>
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenu>
  )
}

export default SidebarTagMenu
