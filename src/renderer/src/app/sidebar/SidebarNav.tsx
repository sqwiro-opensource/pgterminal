import DatabaseConnections from '@src/renderer/app/sidebar/DatabaseConnections';
import SchemaTree from '@src/renderer/app/database/schemas/SchemaTree';
import { Block, Button, Scrollbars } from '@cloudhub-ux/mui';
import useLocation from '@cloudhub-ux/mui/dist/customhooks/useLocation';
import useDatabaseContext from '@src/renderer/context/useDatabaseContext';

export function SidebarNav() {
  const { navigate, location } = useLocation();
  const { selectedConnection } = useDatabaseContext();

  return (
    <Block
      style={{
        overflow: 'hidden'
      }}
    >
      <DatabaseConnections />
      <Block flex={false} row>
        <Block>
          {selectedConnection && (
            <Button
              onPress={() => {
                navigate('/');
              }}
            >
              Browse Db
            </Button>
          )}
        </Block>
        <Block flex={false}>
          {selectedConnection && (
            <Button
              onPress={() => {
                navigate('/migration');
              }}
              outlined
            >
              Arango Migration
            </Button>
          )}
        </Block>
      </Block>
      <Block>
        <Scrollbars absolute>{selectedConnection && <SchemaTree />}</Scrollbars>
      </Block>
    </Block>
  );
}
