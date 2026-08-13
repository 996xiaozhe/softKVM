import * as React from "react";
import { cn } from "../../lib/utils";
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({className,...p},r)=><div ref={r} className={cn("rounded-xl border bg-card text-card-foreground shadow-sm",className)} {...p}/>); Card.displayName="Card";
export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({className,...p},r)=><div ref={r} className={cn("flex flex-col space-y-1.5 p-6",className)} {...p}/>); CardHeader.displayName="CardHeader";
export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(({className,...p},r)=><h3 ref={r} className={cn("font-semibold leading-none tracking-tight",className)} {...p}/>); CardTitle.displayName="CardTitle";
export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({className,...p},r)=><p ref={r} className={cn("text-sm text-muted-foreground",className)} {...p}/>); CardDescription.displayName="CardDescription";
export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({className,...p},r)=><div ref={r} className={cn("p-6 pt-0",className)} {...p}/>); CardContent.displayName="CardContent";
