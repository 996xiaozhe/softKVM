import * as React from "react";
import { cn } from "../../lib/utils";
export const Alert=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(({className,...p},r)=><div ref={r} role="alert" className={cn("relative w-full rounded-lg border p-4 text-sm",className)} {...p}/>); Alert.displayName="Alert";
