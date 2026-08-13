import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
const variants=cva("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",{variants:{variant:{default:"border-transparent bg-primary text-primary-foreground",secondary:"border-transparent bg-secondary text-secondary-foreground",outline:"text-foreground",success:"border-emerald-500/20 bg-emerald-500/10 text-emerald-600"}},defaultVariants:{variant:"default"}});
export function Badge({className,variant,...p}:React.HTMLAttributes<HTMLDivElement>&VariantProps<typeof variants>){return <div className={cn(variants({variant}),className)} {...p}/>}
