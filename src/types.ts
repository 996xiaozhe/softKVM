export interface InputSource { value: number; name: string }
export interface MonitorInfo {
  id: string;
  description: string;
  displayIndex: number;
  physicalIndex: number;
  currentInput: number | null;
  inputs: InputSource[];
  capabilitiesDetected: boolean;
  capabilities: string | null;
  warning: string | null;
}
export interface Device {
  id: string;
  name: string;
  shortcut?: string;
}
export type ThemeColor = "cyan" | "blue" | "emerald" | "orange" | "zinc";
export interface MonitorPreference {
  alias?: string;
  assignments: Record<string, string | undefined>;
  compatibilityExpanded?: boolean;
}
export interface Preferences {
  version: 2;
  theme?: ThemeColor;
  devices: Device[];
  monitors: Record<string, MonitorPreference>;
}
