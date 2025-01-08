import React from 'react';
import { Alert, Block } from '@cloudhub-ux/mui';
import { KeyValueTable } from '@cloudhub-ux/mui/dist/tables';
import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext';
import DocumentEditor from './DocumentEditor';

function DocumentViewer({
  schema,
  tableName,
  pk,
  value,
  document
}: {
  schema: string;
  tableName?: string;
  pk: string;
  value: string;
  document: any;
}) {
  const { dbQuery } = useSelectedDatabaseContext();

  const [fetchedDocument, setFetchedDocument] = React.useState(document || {});
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    const getDocument = async () => {
      const sql = `SELECT * FROM ${schema}.${tableName} WHERE ${pk} = '${value}'`;

      const { data, error } = await dbQuery(sql);

      if (Array.isArray(data) && data.length === 1) {
        setFetchedDocument(data[0]);
      }
      if (error) {
        setError(error);
      }
    };

    if (pk && value && schema && tableName) {
      getDocument();
    }
  }, [pk, value, schema, tableName]);

  return (
    <Block>
      <Block padding flex={false}>
        <Alert error message={error} />
      </Block>

      <Block>
        <Block absolute>
          <DocumentEditor pk={pk} row={fetchedDocument} schema={schema} tableName={tableName} />
        </Block>
      </Block>
    </Block>
  );
}

export default DocumentViewer;
