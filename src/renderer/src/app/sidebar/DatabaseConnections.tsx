import React from 'react'
import { Block } from '@cloudhub-ux/mui'
import { StaticListSelector } from '@cloudhub-ux/mui/dist/mui'
import { ConnectionForm } from './ConnectionForm'
import useDatabaseContext from '@src/renderer/context/useDatabaseContext'
import { SavedConnections } from '@src/renderer/app/sidebar/SavedConnections'

function DatabaseConnections() {
  const { databases, selectedDatabase, dispatch } = useDatabaseContext()

  return (
    <Block flex={false}>
      <Block flex={false} row>
        {!selectedDatabase && <ConnectionForm />}
      </Block>

      <SavedConnections />

      <Block flex={false} row right middle padding={2}>
        <Block>
          {selectedDatabase && (
            <StaticListSelector
              options={databases}
              value={selectedDatabase}
              onSelectChange={(value) => {
                if (value) {
                  dispatch((state) => ({
                    databaseContext: {
                      ...state.databaseContext,
                      selectedDatabase: value
                    }
                  }))
                } else {
                  dispatch((state) => ({
                    databaseContext: {
                      ...state.databaseContext,
                      selectedDatabase: state.databaseContext.defaultDatabase
                    }
                  }))
                }
              }}
              showError={false}
            />
          )}
        </Block>
      </Block>
    </Block>
  )
}

export default DatabaseConnections
