import { Box, Button, ScrollArea, Separator, Tooltip } from "@bolid-ui/themes";
import * as React from "react";

import { useIsMobile } from "../../hooks/use-mobile";
import { cn } from "../../lib/cn";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./sheet";

const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "12rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarContextProps = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean | ((open: boolean) => boolean)) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean | ((open: boolean) => boolean)) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  openMobile: openMobileProp,
  onOpenMobileChange: setOpenMobileProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  openMobile?: boolean;
  onOpenMobileChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [_openMobile, _setOpenMobile] = React.useState(false);
  const [_open, _setOpen] = React.useState(defaultOpen);
  const open = openProp ?? _open;
  const openMobile = openMobileProp ?? _openMobile;

  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value;
      if (setOpenProp) setOpenProp(openState);
      else _setOpen(openState);
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    },
    [open, setOpenProp],
  );

  const setOpenMobile = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(openMobile) : value;
      if (setOpenMobileProp) setOpenMobileProp(openState);
      else _setOpenMobile(openState);
    },
    [openMobile, setOpenMobileProp],
  );

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) setOpenMobile((value) => !value);
    else setOpen((value) => !value);
  }, [isMobile, setOpen, setOpenMobile]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const state = open ? "expanded" : "collapsed";
  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <Box
        className={cn(
          "group/sidebar-wrapper relative flex h-full min-h-0 w-full",
          className,
        )}
        data-slot="sidebar-wrapper"
        data-state={state}
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        {...props}
      >
        {children}
      </Box>
    </SidebarContext.Provider>
  );
}

function Sidebar({
  side = "left",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { side?: "left" | "right" }) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          className="bg-background w-[calc(var(--sidebar-width)*var(--scaling))] p-0 [&>button]:hidden"
          data-mobile="true"
          data-sidebar="sidebar"
          data-slot="sidebar"
          side={side}
          style={
            { "--sidebar-width": SIDEBAR_WIDTH_MOBILE } as React.CSSProperties
          }
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Навигация</SheetTitle>
            <SheetDescription>Навигация учебного симулятора</SheetDescription>
          </SheetHeader>
          <Box className="flex h-full w-full flex-col">{children}</Box>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Box
      className="group peer hidden sm:block"
      data-collapsible={state === "collapsed" ? "icon" : ""}
      data-side={side}
      data-slot="sidebar"
      data-state={state}
      data-variant="sidebar"
    >
      <Box
        className={cn(
          "relative w-[calc(var(--sidebar-width)*var(--scaling))] bg-transparent transition-[width] duration-[var(--app-transition-duration-base)] ease-linear",
          "group-data-[side=right]:rotate-180",
          "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)*var(--scaling))]",
        )}
        data-slot="sidebar-gap"
      />
      <Box
        className={cn(
          "absolute inset-y-0 z-10 hidden h-full w-[calc(var(--sidebar-width)*var(--scaling))] transition-[left,right,width] duration-[var(--app-transition-duration-base)] ease-linear sm:block",
          side === "left" ? "left-0" : "right-0",
          "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)*var(--scaling))]",
          className,
        )}
        data-slot="sidebar-container"
        {...props}
      >
        <Box
          className="bg-background flex h-full w-full flex-col"
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "bg-background relative flex w-full flex-1 flex-col",
        className,
      )}
      data-slot="sidebar-inset"
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <Box
      className={cn("p-rx-2 gap-rx-2 flex shrink-0 flex-col", className)}
      data-sidebar="header"
      data-slot="sidebar-header"
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <Box
      className={cn("gap-rx-2 p-rx-2 flex flex-col", className)}
      data-sidebar="footer"
      data-slot="sidebar-footer"
      {...props}
    />
  );
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      className={cn("mx-rx-2 w-auto", className)}
      data-sidebar="separator"
      data-slot="sidebar-separator"
      {...props}
    />
  );
}

function SidebarContent({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const { state } = useSidebar();
  return (
    <Box
      className={cn("gap-rx-2 flex min-h-0 flex-1 flex-col", className)}
      data-sidebar="content"
      data-slot="sidebar-content"
      {...props}
    >
      <ScrollArea
        className="not-group-data-[collapsible=icon]:[&:has(>.rt-ScrollAreaScrollbar[data-orientation=vertical])>.rt-ScrollAreaViewport>div]:pr-rx-2 group-data-[collapsible=icon]:overflow-x-hidden [&>.rt-ScrollAreaViewport>*]:w-full [&>.rt-ScrollAreaViewport>*]:min-w-0"
        scrollbars="vertical"
        type={state === "collapsed" ? "hover" : "auto"}
      >
        {children}
      </ScrollArea>
    </Box>
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <Box
      className={cn(
        "px-rx-2 pt-rx-2 relative flex w-full min-w-0 flex-col",
        className,
      )}
      data-sidebar="group"
      data-slot="sidebar-group"
      {...props}
    />
  );
}

function SidebarGroupLabel({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "duration-(--app-transition-duration-base) text-gray-10 group-data-[collapsible=icon]:hidden flex h-7 shrink-0 items-center px-rx-3 text-xs font-medium tracking-wider uppercase select-none",
        className,
      )}
      data-sidebar="group-label"
      data-slot="sidebar-group-label"
      {...props}
    >
      {children}
    </div>
  );
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <Box
      className={cn("w-full text-sm", className)}
      data-sidebar="group-content"
      data-slot="sidebar-group-content"
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn("gap-rx-1 flex w-full min-w-0 flex-col", className)}
      data-sidebar="menu"
      data-slot="sidebar-menu"
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      className={cn("group/menu-item relative", className)}
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
      {...props}
    />
  );
}

type SidebarMenuButtonProps = {
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: React.ReactNode;
  tooltipSide?: "left" | "right";
  className?: string;
  children?: React.ReactNode;
  disabled?: boolean;
};

function SidebarMenuButton({
  asChild = true,
  isActive = false,
  tooltip,
  tooltipSide = "right",
  className,
  children,
  disabled,
}: SidebarMenuButtonProps) {
  const { isMobile, state } = useSidebar();
  const button = (
    <Button
      asChild={asChild}
      className={cn(
        "peer/menu-button m-0 box-border flex h-(--base-button-height) w-full! justify-start gap-(--space-2) px-(--space-3) py-0",
        "group-has-data-[sidebar=menu-action]/menu-item:pr-rx-8 group-data-[collapsible=icon]:size-rx-8 group-data-[collapsible=icon]:p-rx-2 transition-[width,height,padding] duration-(--app-transition-duration-base) ease-linear [&>span:last-child]:truncate",
        "[&>svg]:size-rx-4 [&>svg]:shrink-0 data-[active=true]:[&>svg]:stroke-[2.5]",
        className,
      )}
      color={isActive ? undefined : "gray"}
      data-active={isActive}
      data-sidebar="menu-button"
      data-slot="sidebar-menu-button"
      disabled={disabled}
      variant={isActive ? "soft" : "ghost"}
    >
      {children}
    </Button>
  );

  if (!tooltip) return button;
  return (
    <Tooltip
      align="center"
      content={tooltip}
      hidden={state !== "collapsed" || isMobile}
      side={tooltipSide}
    >
      {button}
    </Tooltip>
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  useSidebar,
};
