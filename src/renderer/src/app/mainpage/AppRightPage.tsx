import React from 'react';
import { Block, Button, Text } from '@cloudhub-ux/mui';
import useDatabaseContext from '@src/renderer/context/useDatabaseContext';
import { TabbedInterface } from '@src/renderer/app/mainpage/TabbedInterface';
import ConnectionForm from '@src/renderer/app/sidebar/ConnectionForm';

function AppRightPage() {
  const { selectedConnection } = useDatabaseContext();

  return (
    <Block>
      {selectedConnection ? (
        <Block>
          <TabbedInterface />
        </Block>
      ) : (
        <Block center middle>
          <Block flex={false} style={{ width: 400 }} padding={20}>
            <Block padding rounded>
              <Text center darkGray>
                No database server connected
              </Text>
            </Block>
            <Block flex={false} row center middle>
              <ConnectionForm
                anchorComponent={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-center text-center font-normal m-2"
                  >
                    <span className="flex-grow truncate">New Connection</span>
                  </Button>
                }
              />
            </Block>
          </Block>
        </Block>
      )}
    </Block>
  );
}

export default AppRightPage;
