import React from 'react'
import { Block } from '@cloudhub-ux/mui'
import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext'
import { cn } from '@src/renderer/utils/utils'
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button'
import { MdiBolt } from '@cloudhub-ux-icons/mdi'

function TableRelationsTree({ schema, tableName }: { schema: string; tableName: string }) {
  const { schemas, dispatch, dbQuery } = useSelectedDatabaseContext()

  if (!schema || !tableName) {
    return null
  }
  const level = 1

  const relations = schemas[schema].tables.tableList[tableName].relations.relationList

  return (
    <Block flex={false}>
      <ul className={cn('space-y-1', level > 0 && 'ml-8')}>
        {Object.values(relations || {}).map((item) => (
          <li key={item.relationName}>
            <div className="flex items-center">
              <Button variant="ghost" size="sm" className={cn('h-8 hover:bg-muted')}>
                <MdiBolt size={16} color="orange" className="h-4 w-4 shrink-0 mr-1" />
                <span className="ml-2">{item.relationName}</span>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Block>
  )
}

export default TableRelationsTree
