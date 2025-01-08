import { Alert, Block, toastr, useMuiThemeContext } from '@cloudhub-ux/mui';
import { Button } from '@cloudhub-ux/shadcn/src/components/ui/button';
import React from 'react';
import { MdiSave } from '@cloudhub-ux-icons/mdi';
import MonacoJsonEditor from '../editor/MonacoJsonEditor';
import { KeyValueTable } from './tables';
import useSelectedDatabaseContext from '../../database/context/useSelectedDatabaseContext';

const formatValue = (value: any) => {
  switch (typeof value) {
    case 'string':
      return `'${value}'`.replace(/'/g, "''");
    case 'number':
      return value;
    case 'object':
      return `'${JSON.stringify(value)}'`.replace(/'/g, "''");
    default:
      return value;
  }
};

function DocumentEditor({
  pk,
  row,
  schema,
  tableName,
  className,
  tableStructure
}: {
  pk: string;
  row: any;
  schema: string;
  tableName?: string;
  className?: string;
  tableStructure?: {
    [key: string]: {
      name: string;
      type: string;
      defaultValue: string;
      isNullable: boolean;
      isPrimaryKey: boolean;
    };
  };
}) {
  const { themeMode } = useMuiThemeContext();
  const { dbQuery } = useSelectedDatabaseContext();

  const [initialValue, setInitialValue] = React.useState(JSON.stringify(row, null, 2));

  const [value, setValue] = React.useState(JSON.stringify(row, null, 2));
  const [error, setError] = React.useState('');
  const handleEditorChange = (value: string | undefined) => {
    setValue(value || '');
  };

  React.useEffect(() => {
    setInitialValue(JSON.stringify(row, null, 2));
    setValue(JSON.stringify(row, null, 2));
  }, [JSON.stringify(row)]);

  const handleSave = async () => {
    let valuesToSave = {};
    try {
      valuesToSave = JSON.parse(value);
    } catch (error) {
      console.error(error);
    }

    const columns = Object.keys(valuesToSave)
      .filter((key) => key !== pk)
      .map((key) => `"${key}" = ${formatValue(valuesToSave[key])}`)
      .join(', ');

    const { data, error } = await dbQuery(
      `UPDATE ${schema}.${tableName} SET ${columns} WHERE ${pk} = '${row[`${pk}`]}' RETURNING *`
    );

    if (error) {
      setError(error);
    }

    if (Array.isArray(data) && data.length === 1) {
      toastr.success('Document updated successfully');
      setInitialValue(JSON.stringify(data[0], null, 2));
      setValue(JSON.stringify(data[0], null, 2));
    }

    // setInitialValue(value);
  };

  return (
    <Block>
      <Block flex={false} padding row paper margin>
        <KeyValueTable
          sx={{
            backgroundColor: 'transparent'
          }}
          oddEvenPattern={false}
          data={{
            [pk]: (
              <Block row right>
                <Block left middle>
                  <span className="text-md text-green-500 bg-transparent">{row[`${pk}`]}</span>
                </Block>

                <Block flex={false} row right middle padding={5}>
                  <Button
                    disabled={initialValue === value}
                    size="sm"
                    variant="outline"
                    className="text-sm rounded-lg"
                    onClick={handleSave}
                  >
                    <MdiSave />
                    Save
                  </Button>
                </Block>
              </Block>
            ),
            ...(row && row._from && { _from: row._from }),
            ...(row && row._to && { _to: row._to })
          }}
        />
      </Block>
      <Alert error message={error} onClose={() => setError('')} />

      <Block>
        <MonacoJsonEditor
          value={value}
          options={{
            minimap: { enabled: false },
            readOnly: false
          }}
          onChange={handleEditorChange}
        />
      </Block>
    </Block>
  );
}

export default DocumentEditor;
