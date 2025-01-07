import JsonView from '@uiw/react-json-view';
import { lightTheme } from '@uiw/react-json-view/light';
import { nordTheme } from '@uiw/react-json-view/nord';
import { useMuiThemeContext } from '@cloudhub-ux/mui';
import { Button } from '@cloudhub-ux/shadcn/src/components/ui/button';
import useTabInterfaceContext from '@src/renderer/context/useTabInterfaceContext';

function EditDocument({
  row,
  schema,
  tableName,
  className
}: {
  row: any;
  schema: string;
  tableName?: string;
  className?: string;
}) {
  const { themeMode } = useMuiThemeContext();
  const { openDocumentTab } = useTabInterfaceContext();

  return (
    <JsonView
      value={row as any}
      displayDataTypes={false}
      shortenTextAfterLength={500}
      style={{
        ...(themeMode === 'dark' ? nordTheme : lightTheme),
        flex: 1
      }}
      className={className}
    >
      <JsonView.String
        render={({ children, ...reset }, { type, value, keyName }) => {
          const isImg = /^https?.*\.(jpg|png)$/i.test(value as string);
          if (type === 'type' && isImg) {
            return <span />;
          }
          if (type === 'value' && isImg) {
            return <img {...reset} height="26" src={value} />;
          }
        }}
      />
      <JsonView.String
        render={({ children, ...reset }, { type, value, keyName }) => {
          if (keyName === '_ref' || (keyName === '_id' && schema && tableName)) {
            if (`${value}`.includes('/')) {
              const [tableName, document_id] = `${value}`.split('/');

              if (`${tableName}`.includes('_')) {
                const [schema, schema_tableName] = tableName.split('_');

                return (
                  <Button
                    variant="link"
                    className="p-0 m-0"
                    onClick={() => {
                      openDocumentTab({
                        schema,
                        tableName,
                        pk: '_id',
                        value: `${value}`,
                        document: row || {}
                      });
                    }}
                  >
                    <span>"{value}"</span>
                  </Button>
                );
              }
            }
          }
        }}
      />
    </JsonView>
  );
}

export default EditDocument;
