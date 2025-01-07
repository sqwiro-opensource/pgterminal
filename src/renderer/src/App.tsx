import Versions from './components/Versions';
import electronLogo from './assets/electron.svg';
import INITIAL_STATE from '@src/renderer/context/INITIAL_STATE';
import { ThemeProvider } from '@cloudhub-ux/min';

import { AppContextProvider } from '@cloudhub-ux/zstore';
import LocationProvider from '@cloudhub-ux/mui/dist/customhooks/LocationProvider';
import ShadcnThemeProvider from '@cloudhub-ux/shadcn/esm/theme/ShadcnThemeProvider';
import { fonts, sizes } from '@src/renderer/theme';
import MainPage from '@src/renderer/app/mainpage/MainPage';

// Define process if it doesn't exist
if (typeof window !== 'undefined' && !window.process) {
  window.process = { env: { NODE_ENV: 'production' } };
}

function App(): JSX.Element {
  const ipcHandle = (): void => window.electron.ipcRenderer.send('ping');

  const ColorTheme = 'slateTheme';

  return (
    <AppContextProvider
      APP_INITIAL_STATE={{
        ...INITIAL_STATE,
        authContext: {},
        databaseContext: {}
      }}
    >
      <LocationProvider>
        <ShadcnThemeProvider
          fonts={fonts}
          sizes={sizes}
          defaultTheme={ColorTheme || 'defaultTheme'}
        >
          <ThemeProvider
            defaultTheme={ColorTheme || 'defaultTheme'}
            fonts={fonts}
            sizes={sizes}
            CONFIG={{}}
          >
            <MainPage />
          </ThemeProvider>
        </ShadcnThemeProvider>
      </LocationProvider>
    </AppContextProvider>
  );
}

export default App;
