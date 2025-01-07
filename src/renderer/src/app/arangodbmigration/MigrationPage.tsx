import React from 'react';
import {
  Block,
  Text,
  Input,
  Button,
  AsyncStorage,
  FieldBlock,
  FieldButton,
  ListMenuItem,
  IconButton
} from '@cloudhub-ux/mui';
import { Field, Form } from '@cloudhub-ux/mui/dist/form';
import useArangoDbServer from '@src/renderer/app/arangodbmigration/context/useArangoDbServer';
import { StaticListSelector } from '@cloudhub-ux/mui/dist/mui';
import ConnectedDatabase from '@src/renderer/app/arangodbmigration/connecteddatabase/ConnectedDatabase';
import { colors } from '@src/renderer/theme';
import { MdiClose } from '@cloudhub-ux-icons/mdi';

function MigrationPage() {
  const { dispatch, savedConnections, connectedDataseServer } = useArangoDbServer();

  React.useEffect(() => {
    const getSavedValues = async () => {
      const savedValues = await AsyncStorage.getItem('arangodb-servers');

      dispatch((state) => ({
        arangoDbServerContext: {
          ...state.arangoDbServerContext,
          savedConnections: {
            ...savedValues
          }
        }
      }));
    };
    getSavedValues();
  }, []);

  const isConnected = connectedDataseServer.databases.length > 0;

  return (
    <Block>
      <Block flex={false} padding>
        {!isConnected && (
          <Form
            onSubmit={async (values: any) => {
              const databases = await window.arangoapi.connectArangoDbServer(values);

              if (Array.isArray(databases)) {
                dispatch((state) => ({
                  arangoDbServerContext: {
                    ...state.arangoDbServerContext,
                    connectedDataseServer: {
                      ...state.arangoDbServerContext.connectedDataseServer,
                      connectionDetails: values,
                      databases
                    }
                  }
                }));

                await AsyncStorage.setItem('arangodb-servers', {
                  ...savedConnections,
                  [values.servername]: values
                });
              }
            }}
            initialValues={{
              servername: 'localhost',
              host: 'localhost',
              port: 8529,
              username: 'root',
              password: ''
            }}
            render={({ handleSubmit, form, values }) => {
              return (
                <>
                  <Block flex={false}>
                    <FieldBlock row>
                      <Field
                        label="Server Name"
                        name="servername"
                        component={Input}
                        required
                        flex
                      />
                      <Field label="Host" name="host" component={Input} required flex />
                      <Field label="Port" name="port" component={Input} required />
                    </FieldBlock>
                    <FieldBlock row>
                      <Field label="Username" name="username" component={Input} required flex />
                      <Field
                        label="Password"
                        name="password"
                        type="password"
                        component={Input}
                        flex
                      />
                    </FieldBlock>
                    <Block flex={false} row right>
                      <Button dark small rounded onClick={handleSubmit}>
                        Connect
                      </Button>
                    </Block>
                  </Block>
                  <Block flex={false} style={{ width: 400 }}>
                    <Block flex={false} padding>
                      <Text size={16}>Saved Connections</Text>
                    </Block>
                    {!isConnected &&
                      Object.values(savedConnections).map((connection) => {
                        return (
                          <Block key={connection.host} flex={false} row middle>
                            <ListMenuItem
                              primary={connection.servername}
                              secondary={`${connection.username}@${connection.host}:${connection.port}`}
                              onClick={() => {
                                form.change('servername', connection.servername);
                                form.change('host', connection.host);
                                form.change('port', connection.port);
                                form.change('username', connection.username);
                                form.change('password', connection.password);
                              }}
                            />
                            <IconButton
                              onPress={async () => {
                                const newSavedConnections = { ...savedConnections };

                                delete newSavedConnections[connection.servername];

                                dispatch((state) => ({
                                  arangoDbServerContext: {
                                    ...state.arangoDbServerContext,
                                    savedConnections: newSavedConnections
                                  }
                                }));

                                await AsyncStorage.setItem(
                                  'arangodb-servers',
                                  JSON.stringify({
                                    ...newSavedConnections
                                  })
                                );
                              }}
                            >
                              <MdiClose />
                            </IconButton>
                          </Block>
                        );
                      })}
                  </Block>
                </>
              );
            }}
          />
        )}

        {isConnected && (
          <Block flex={false}>
            <Block flex={false} row center middle padding color="grey" rounded>
              <Block flex={false}>
                <Form
                  onSubmit={async (values) => {
                    console.log(values);
                  }}
                  render={({ handleSubmit, form, values }) => {
                    return (
                      <Block flex={false}>
                        <Block row middle>
                          <Block flex={false}>
                            <Text
                              size={16}
                            >{`Connected to ${connectedDataseServer.connectionDetails.host}`}</Text>
                          </Block>
                          <Field
                            label=""
                            name="selectedDatabase"
                            component={StaticListSelector}
                            options={connectedDataseServer.databases}
                            showError={false}
                            containerStyle={{
                              width: 300,
                              backgroundColor: colors.grey[700],
                              color: 'black',
                              borderRadius: 5,
                              marginRight: 5
                            }}
                            onSelectChange={async (dbName) => {
                              if (dbName) {
                                const collections =
                                  await window.arangoapi.selectArangoDbDatabase(dbName);

                                if (Array.isArray(collections)) {
                                  dispatch((state) => ({
                                    arangoDbServerContext: {
                                      ...state.arangoDbServerContext,
                                      selectedDatabase: {
                                        ...state.arangoDbServerContext.selectedDatabase,
                                        databaseName: dbName,
                                        collections
                                      }
                                    }
                                  }));
                                }
                              }
                            }}
                            flex
                          />
                        </Block>
                      </Block>
                    );
                  }}
                />
              </Block>
            </Block>
          </Block>
        )}
      </Block>

      <Block>
        <ConnectedDatabase />
      </Block>
    </Block>
  );
}

export default MigrationPage;
