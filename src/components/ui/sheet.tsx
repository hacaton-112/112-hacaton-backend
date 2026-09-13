import { Dialog as SheetPrimitive } from "@bolid-ui/primitives";
import { Box, IconButton, Theme } from "@bolid-ui/themes";
import { X } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "../../lib/cn";

function Sheet(props: ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <SheetPrimitive.Portal>
      <Theme asChild>
        <SheetPrimitive.Overlay
          className="bg-overlay fixed inset-0"
          data-slot="sheet-overlay"
        >
          <div
            className={cn(
              "fixed inset-0 flex",
              side === "right" && "justify-end",
              side === "left" && "justify-start",
              side === "top" && "items-start",
              side === "bottom" && "items-end",
            )}
          >
            <SheetPrimitive.Content
              className={cn(
                "bg-panel-solid shadow-6 relative z-1 flex min-h-0 flex-col overflow-y-auto transition-transform ease-in-out",
                side === "right" &&
                  "h-full w-3/4 border-l sm:max-w-[calc(384px*var(--scaling))]",
                side === "left" &&
                  "h-full w-3/4 border-r sm:max-w-[calc(384px*var(--scaling))]",
                side === "top" && "w-full border-b",
                side === "bottom" && "w-full border-t",
                className,
              )}
              data-slot="sheet-content"
              {...props}
            >
              {children}
              <SheetPrimitive.Close asChild>
                <IconButton
                  aria-label="Закрыть"
                  className="right-rx-4 top-rx-4 absolute m-0"
                  color="gray"
                  variant="ghost"
                >
                  <X />
                </IconButton>
              </SheetPrimitive.Close>
            </SheetPrimitive.Content>
          </div>
        </SheetPrimitive.Overlay>
      </Theme>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <Box
      className={cn("gap-rx-0.5 p-rx-4 flex flex-col", className)}
      {...props}
    />
  );
}

function SheetTitle(props: ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className="font-medium" {...props} />;
}

function SheetDescription(
  props: ComponentProps<typeof SheetPrimitive.Description>,
) {
  return (
    <SheetPrimitive.Description className="text-2 text-grayA-11" {...props} />
  );
}

export { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle };
