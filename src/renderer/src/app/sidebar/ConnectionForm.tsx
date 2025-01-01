// src/renderer/src/components/ConnectionForm.tsx
import React, { useState } from 'react'
import { Form, Field } from '@cloudhub-ux/mui/dist/form'
import { Alert, Block, FieldBlock, Input, LoadingButton } from '@cloudhub-ux/mui'
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button'
import { Database, ChevronRight, MoreVertical } from 'lucide-react'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@cloudhub-ux/shadcn/esm/components/ui/dialog'
import { MdiPlus } from '@cloudhub-ux-icons/mdi'
import useDatabaseContext from '@src/renderer/context/useDatabaseContext'

interface SavedConnection {
  name: string
  host: string
  port: number
  database: string
  user: string
  password: string
}

export const ConnectionForm: React.FC<{
  connection?: SavedConnection
  anchorComponent?: React.ReactNode
}> = ({ connection = {}, anchorComponent }) => {
  const [loading, setLoading] = useState(false)
  const dlgRef = React.useRef<HTMLDialogElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const { selectedConnection, dispatch } = useDatabaseContext()

  const handleSubmit = async (values, form) => {
    setLoading(true)
    setError(null)

    try {
      // First test the connection
      const { databases, message } = await window.api.testConnection(values)

      if (message) {
        setError(message)
        return
      }

      if (Array.isArray(databases) && databases.length > 0) {
        dispatch((state) => ({
          databaseContext: {
            ...state.databaseContext,
            databases: databases,
            defaultDatabase: values.database,
            selectedDatabase: values.database,
            selectedConnection: values.name,
            savedConnections: {
              ...state.databaseContext.savedConnections,
              [values.name]: values
            }
          }
        }))
      }

      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const getAnchor = () => {
    if (anchorComponent) {
      return React.cloneElement(anchorComponent, {
        onClick: () => setOpen(true)
      })
    }

    return null
  }

  const Anchor = getAnchor()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Block row>
        {connection && connection.name ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-left font-normal"
            disabled={selectedConnection === connection.name}
            onClick={() => setOpen(true)}
          >
            <Database className="mr-2 h-4 w-4" />
            <span className="flex-grow truncate">{connection.name}</span>
            <ChevronRight className="ml-auto h-4 w-4 opacity-50" />
          </Button>
        ) : (
          Anchor || (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-left font-normal m-2"
              onClick={() => setOpen(true)}
            >
              <MdiPlus className="mr-2 h-4 w-4" />
              <span className="flex-grow truncate">New Connection</span>
            </Button>
          )
        )}
      </Block>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect to PostgreSQL Server</DialogTitle>
        </DialogHeader>
        <Form
          initialValues={{
            database: 'postgres',
            host: 'localhost',
            port: 5432,
            user: 'postgres',
            ...connection
          }}
          onSubmit={handleSubmit}
          render={({ handleSubmit }) => {
            return (
              <>
                <Block>
                  <Alert error message={error} />
                  <>
                    <Field label="Connection Nane" name="name" component={Input} required />
                    <FieldBlock row>
                      <Field label="Host" name="host" component={Input} required flex />
                      <Field label="Port" name="port" component={Input} required flex />
                    </FieldBlock>
                    <Field label="Database" name="database" component={Input} required />
                    <Field label="User" name="user" component={Input} required />
                    <Field
                      label="Password"
                      name="password"
                      type="password"
                      component={Input}
                      required
                    />
                  </>
                </Block>

                <Block flex={false} row right>
                  <LoadingButton loading={loading} onClick={handleSubmit} contained small>
                    Connect
                  </LoadingButton>
                </Block>
              </>
            )
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

export default ConnectionForm
