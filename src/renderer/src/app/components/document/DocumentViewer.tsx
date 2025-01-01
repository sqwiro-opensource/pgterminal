import React from 'react';
import { Alert, Block, Scrollbars } from '@cloudhub-ux/mui';
import { KeyValueTable } from '@cloudhub-ux/mui/dist/tables';
import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext';
import ExpandedRow from '@src/renderer/app/components/results/datatable/components/ExpandedRow';

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
      const { data, error } = await dbQuery(
        `SELECT * FROM ${schema}.${tableName} WHERE ${pk} = '${value}'`
      );

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

  console.log('fetchedDocument', fetchedDocument);

  return (
    <Block>
      <Block padding flex={false}>
        <Alert error message={error} />
      </Block>
      <Block flex={false} padding row paper margin>
        <Block flex={false}>
          <KeyValueTable
            sx={{
              backgroundColor: 'transparent'
            }}
            oddEvenPattern={false}
            data={{
              [pk]: <span className="text-md text-green-500 bg-transparent">{value}</span>,
              ...(fetchedDocument && fetchedDocument._from && { _from: fetchedDocument._from }),
              ...(fetchedDocument && fetchedDocument._to && { _to: fetchedDocument._to })
            }}
          />
        </Block>
      </Block>
      <Block padding>
        <Scrollbars absolute>
          <ExpandedRow row={fetchedDocument} schema={schema} tableName={tableName} />
        </Scrollbars>
      </Block>
    </Block>
  );
}

export default DocumentViewer;
