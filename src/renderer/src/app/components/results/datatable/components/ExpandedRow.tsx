import JsonView from '@uiw/react-json-view';
import { lightTheme } from '@uiw/react-json-view/light';
import { nordTheme } from '@uiw/react-json-view/nord';
import { Block, useMuiThemeContext } from '@cloudhub-ux/mui';
import { Button } from '@cloudhub-ux/shadcn/src/components/ui/button';
import useTabInterfaceContext from '@src/renderer/context/useTabInterfaceContext';
import MonacoJsonEditor from '../../../editor/MonacoJsonEditor';
import React from 'react';
import isEqual from 'lodash/isEqual';
import { MdiSave } from '@cloudhub-ux-icons/mdi';

function ExpandedRow({
  row,
  schema,
  tableName,
  className,
  tableStructure
}: {
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
  const [value, setValue] = React.useState(JSON.stringify(row, null, 2));

  const handleEditorChange = (value: string | undefined) => {
    setValue(value || '');
  };

  return (
    <Block
      flex={false}
      style={{
        paddingBottom: Object.keys(row).length * 8
      }}
    >
      <pre>{JSON.stringify(row, null, 2)}</pre>
      <MonacoJsonEditor
        value={value}
        options={{
          minimap: { enabled: false },
          readOnly: true
        }}
        onChange={handleEditorChange}
      />
    </Block>
  );
}

export default ExpandedRow;
