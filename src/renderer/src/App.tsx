import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@cloudhub-ux/shadcn/esm/components/ui/tooltip';
import { boot } from './boot';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UpdateToast } from './features/updates/UpdateToast';
import { ThemeProvider, useTheme } from './lib/theme';
import { installToastPolicy } from './lib/toastPolicy';
import { Shell } from './shell/Shell';

function ThemedToaster(): JSX.Element {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      position="bottom-right"
      duration={4000}
      visibleToasts={3}
      closeButton
      toastOptions={{
        classNames: {
          toast: 'group toast bg-popover text-foreground border-border shadow-md text-[12.5px]',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground'
        }
      }}
    />
  );
}

installToastPolicy();

export default function App(): JSX.Element {
  useEffect(() => {
    void boot();
  }, []);
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={600}>
        <ErrorBoundary>
          <Shell />
        </ErrorBoundary>
        <ThemedToaster />
        <UpdateToast />
      </TooltipProvider>
    </ThemeProvider>
  );
}
