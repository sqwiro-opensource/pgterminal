// src/renderer/src/components/ConnectionForm.tsx
import React, { useState } from 'react';
import { Form, Field } from '@cloudhub-ux/mui/dist/form';
import {
  Alert,
  AsyncStorage,
  Block,
  FieldBlock,
  Input,
  LoadingButton,
  Scrollbars
} from '@cloudhub-ux/mui';
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button';
import { Database, ChevronRight, MoreVertical } from 'lucide-react';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@cloudhub-ux/shadcn/esm/components/ui/dialog';
import { MdiPlus } from '@cloudhub-ux-icons/mdi';
import useDatabaseContext from '@src/renderer/context/useDatabaseContext';
import TableColumnsForm from './TableColumnsForm';
import { StaticListSelector } from '@cloudhub-ux/mui/dist/mui';
import { SimpleTable } from '@src/renderer/app/components/document/tables';
import { Checkbox } from '@cloudhub-ux/shadcn/src/components/ui/checkbox';
import useSelectedDatabaseContext from '../../context/useSelectedDatabaseContext';

interface SavedConnection {
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export const CreateSchemaButton: React.FC<{
  schema?: string;
  anchorComponent?: React.ReactNode;
}> = ({ schema, anchorComponent }) => {
  const [loading, setLoading] = useState(false);
  const dlgRef = React.useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const { dbQuery, dispatch, reload } = useSelectedDatabaseContext();

  const createSchema = async (values, form) => {
    setLoading(true);
    const { error } = await dbQuery(`CREATE SCHEMA ${values.name}`);

    if (error) {
      setError(error);
    } else {
      reload();
      setOpen(false);
      setLoading(false);
    }
  };

  const getAnchor = () => {
    if (anchorComponent) {
      return React.cloneElement(anchorComponent, {
        onClick: () => setOpen(true)
      });
    }

    return null;
  };

  const Anchor = getAnchor();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Block row>
        {Anchor || (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-left font-normal m-2"
            onClick={() => setOpen(true)}
          >
            <MdiPlus size={16} className="mr-2 h-4 w-4" />
          </Button>
        )}
      </Block>

      <DialogContent
        style={{
          minWidth: '400px',
          minHeight: '400px',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <Block flex={false} padding className="px-2 flex-none">
          <DialogTitle>Create Schema</DialogTitle>
        </Block>

        <Form
          onSubmit={createSchema}
          initialValues={{}}
          render={({ handleSubmit, form, values }) => {
            return (
              <>
                <Block>
                  <Field
                    label="Schema Name"
                    name="name"
                    component={Input}
                    onTextChange={(text) => {
                      form.change('name', `${text}`.replace(/ /g, '_'));
                    }}
                    required
                  />
                </Block>
                <Block flex={false} row right>
                  <LoadingButton loading={loading} onClick={handleSubmit} contained small>
                    Create
                  </LoadingButton>
                </Block>
              </>
            );
          }}
        />
      </DialogContent>
    </Dialog>
  );
};

export default CreateSchemaButton;
