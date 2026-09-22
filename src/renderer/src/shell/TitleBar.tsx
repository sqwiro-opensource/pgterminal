import { Moon, PanelLeft, PanelRight, Search, Settings, Sun } from 'lucide-react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import { IconButton } from '../components/ui/IconButton';
import { useTheme } from '../lib/theme';

const isMac = /Mac/i.test(navigator.platform);

export interface TitleBarProps {
  /** Breadcrumb segments for the active tab; empty → app name. */
  crumbs?: string[];
  onToggleSidebar?: () => void;
  onToggleInspector?: () => void;
  onOpenPalette?: () => void;
  onOpenSettings?: () => void;
  sidebarVisible?: boolean;
  inspectorVisible?: boolean;
}

export function TitleBar({
  crumbs = [],
  onToggleSidebar,
  onToggleInspector,
  onOpenPalette,
  onOpenSettings,
  sidebarVisible = true,
  inspectorVisible = false
}: TitleBarProps): JSX.Element {
  const { resolved, toggle } = useTheme();
  return (
    <header
      className={cn(
        'drag relative flex h-[38px] items-center gap-2.5 border-b border-border bg-titlebar pr-2.5',
        isMac ? 'pl-20' : 'pl-3'
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
        {crumbs.length === 0 ? (
          <span className="font-semibold text-foreground">pgui</span>
        ) : (
          crumbs.map((c, i) => (
            <span key={`${c}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <span className="opacity-50">›</span>}
              <span className={cn('truncate', i === crumbs.length - 1 && 'font-medium text-foreground')}>{c}</span>
            </span>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        className="no-drag mx-auto flex h-[26px] w-[360px] items-center gap-2 rounded-md border border-border bg-background px-2.5 text-[12px] text-muted-foreground hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Search size={14} strokeWidth={1.75} />
        <span className="truncate">Search objects or run a command</span>
        <span className="kbd ml-auto">⌘K</span>
      </button>

      <div className="no-drag flex items-center gap-0.5">
        <IconButton label="Toggle sidebar" shortcut="⌘B" active={sidebarVisible} onClick={onToggleSidebar}>
          <PanelLeft size={14} strokeWidth={1.75} />
        </IconButton>
        <IconButton label="Toggle inspector" shortcut="⌘I" active={inspectorVisible} onClick={onToggleInspector}>
          <PanelRight size={14} strokeWidth={1.75} />
        </IconButton>
        <IconButton label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} shortcut="⌘⇧L" onClick={toggle}>
          {resolved === 'dark' ? <Sun size={14} strokeWidth={1.75} /> : <Moon size={14} strokeWidth={1.75} />}
        </IconButton>
        <IconButton label="Settings" shortcut="⌘," onClick={onOpenSettings}>
          <Settings size={14} strokeWidth={1.75} />
        </IconButton>
      </div>
    </header>
  );
}
