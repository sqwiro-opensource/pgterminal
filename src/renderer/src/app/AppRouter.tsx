import React from 'react';
import { Block } from '@cloudhub-ux/mui';
import { Router, Route } from '@cloudhub-ux/mui/dist/reach';
import MainPage from '@src/renderer/app/mainpage/MainPage';
import MigrationPage from '@src/renderer/app/arangodbmigration/MigrationPage';
import AppRightPage from '@src/renderer/app/mainpage/AppRightPage';

const RouteComponent = ({
  component: Component,
  ...props
}: {
  component: React.ComponentType<any>;
  [key: string]: any;
}) => {
  return <Component {...props} />;
};

function AppRouter() {
  return (
    <Router
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column'
      }}
      basepath="/"
    >
      <RouteComponent default path="apprightpage" component={AppRightPage} />
      <RouteComponent path="migration" component={MigrationPage} />
    </Router>
  );
}

export default AppRouter;
