import DatabaseConnections from '@src/renderer/app/sidebar/DatabaseConnections'
import SchemaTree from '@src/renderer/app/database/schemas/SchemaTree'
import { Block, Scrollbars } from '@cloudhub-ux/mui'
import useDatabaseContext from '@src/renderer/context/useDatabaseContext'

export function SidebarNav() {
  const { selectedConnection } = useDatabaseContext()

  return (
    <Block
      style={{
        overflow: 'hidden'
      }}
    >
      <DatabaseConnections />

      <Block>
        <Scrollbars absolute>{selectedConnection && <SchemaTree />}</Scrollbars>
      </Block>
    </Block>
  )
}
