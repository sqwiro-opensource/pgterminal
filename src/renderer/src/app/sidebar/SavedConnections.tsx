import React from 'react'
import { Database, ChevronRight, MoreVertical } from 'lucide-react'

import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@cloudhub-ux/shadcn/esm/components/ui/dropdown-menu'
import useDatabaseContext from '@src/renderer/context/useDatabaseContext'
import ConnectionForm from '@src/renderer/app/sidebar/ConnectionForm'
import INITIAL_STATE from '@src/renderer/context/INITIAL_STATE'

export function SavedConnections() {
  const { savedConnections, selectedConnection, dispatch } = useDatabaseContext()

  const disconnect = async () => {
    await window.api.disconnectServer(savedConnections[selectedConnection])

    dispatch((state) => ({
      databaseContext: {
        ...state.databaseContext,
        selectedDatabase: '',
        selectedConnection: ''
      },
      selectedDatabase: INITIAL_STATE.databaseContext.selectedDatabase
    }))
  }

  return (
    <div className="space-y-1">
      {!selectedConnection &&
        Object.values(savedConnections || {}).map((connection) => (
          <div key={connection.name} className="flex items-center justify-between">
            <ConnectionForm connection={connection} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>View</DropdownMenuItem>
                <DropdownMenuItem>Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}

      {selectedConnection &&
        Object.values(savedConnections || {})
          .filter((connection) => connection.name === selectedConnection)
          .map((connection) => (
            <div key={connection.name} className="flex items-center justify-between">
              <ConnectionForm connection={connection} />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={disconnect}>Disconnect</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
    </div>
  )
}
