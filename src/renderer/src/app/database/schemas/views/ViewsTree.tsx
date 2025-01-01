import React from 'react'
import { Block } from '@cloudhub-ux/mui'
import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext'
import { cn } from '@src/renderer/utils/utils'
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button'
import { MdiBolt, MdiTableViewOutlineRounded } from '@cloudhub-ux-icons/mdi'
import { colors } from '@src/renderer/theme'

function ViewsTree({ schema }: { schema: string }) {
  const { schemas, dispatch, dbQuery } = useSelectedDatabaseContext()

  if (!schema) {
    return null
  }
  const level = 1

  const views = schemas[schema].views.viewList

  return (
    <Block flex={false}>
      <ul className={cn('space-y-1', level > 0 && 'ml-8')}>
        {Object.values(views || {}).map((item) => (
          <li key={item.viewName}>
            <div className="flex items-center">
              <Button variant="ghost" size="sm" className={cn('h-8 hover:bg-muted')}>
                <MdiTableViewOutlineRounded
                  size={16}
                  color={colors.cyan[300]}
                  className="h-4 w-4 shrink-0 mr-1"
                />
                <span className="ml-2">{item.viewName}</span>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Block>
  )
}

export default ViewsTree
