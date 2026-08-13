import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Cpu, LayoutGrid, Loader2, Minus, MonitorCog, Plus, RefreshCw, ScanLine, Settings, Trash2, X, Zap } from "lucide-react";
import type { Device, MonitorInfo, MonitorPreference, Preferences, ThemeColor } from "./types";
import { HotkeyInput } from "./components/hotkey-input";
import { Alert } from "./components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./components/ui/alert-dialog";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Separator } from "./components/ui/separator";
import { Switch } from "./components/ui/switch";

const STORAGE_KEY = "softkvm.preferences.v2";
const LEGACY_STORAGE_KEY = "softkvm.preferences.v1";
const MONITOR_CACHE_KEY = "softkvm.monitors.v1";
const EMPTY: Preferences = { version: 2, theme: "cyan", devices: [], monitors: {} };
const appWindow = getCurrentWindow();
type Page = "devices" | "monitors" | "settings";
type Notice = { type: "error" | "success"; text: string; page?: Page };

const THEMES: Record<ThemeColor, { label: string; primary: string; ring: string; preview: string }> = {
  cyan: { label: "青色", primary: "187 85% 38%", ring: "187 85% 38%", preview: "bg-cyan-600" },
  blue: { label: "蓝色", primary: "221 83% 53%", ring: "221 83% 53%", preview: "bg-blue-600" },
  emerald: { label: "绿色", primary: "160 84% 34%", ring: "160 84% 34%", preview: "bg-emerald-600" },
  orange: { label: "橙色", primary: "24 95% 50%", ring: "24 95% 50%", preview: "bg-orange-500" },
  zinc: { label: "中性黑", primary: "240 6% 16%", ring: "240 6% 16%", preview: "bg-zinc-800" },
};

type ShortcutSyncState = { queue: Promise<void>; revision: number };
const shortcutSyncState = (() => {
  const scope = globalThis as typeof globalThis & { __softkvmShortcutSync?: ShortcutSyncState };
  return scope.__softkvmShortcutSync ||= { queue: Promise.resolve(), revision: 0 };
})();

function id() { return globalThis.crypto?.randomUUID?.() ?? `device-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Preferences | null;
    if (saved?.version === 2 && Array.isArray(saved.devices) && saved.monitors) return saved;
  } catch { /* fall through to legacy migration */ }
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "null") as { monitors?: Record<string, { alias?: string; inputs?: Record<string, { alias?: string; shortcut?: string }> }> } | null;
    if (!legacy?.monitors) return EMPTY;
    const migrated: Preferences = structuredClone(EMPTY);
    for (const [monitorId, oldMonitor] of Object.entries(legacy.monitors)) {
      const monitor: MonitorPreference = { alias: oldMonitor.alias, assignments: {} };
      for (const [input, oldInput] of Object.entries(oldMonitor.inputs || {})) {
        if (!oldInput.alias && !oldInput.shortcut) continue;
        const device: Device = { id: id(), name: oldInput.alias || `设备 ${input}`, shortcut: oldInput.shortcut };
        migrated.devices.push(device);
        monitor.assignments[input] = device.id;
      }
      migrated.monitors[monitorId] = monitor;
    }
    return migrated;
  } catch { return EMPTY; }
}

function readMonitorCache(): MonitorInfo[] | null {
  try {
    const cache = JSON.parse(localStorage.getItem(MONITOR_CACHE_KEY) || "null") as { version?: number; monitors?: MonitorInfo[] } | null;
    if (cache?.version !== 1 || !Array.isArray(cache.monitors) || cache.monitors.length === 0) return null;
    if (cache.monitors.some(monitor => typeof monitor.id !== "string" || !Array.isArray(monitor.inputs))) return null;
    return cache.monitors.map(monitor => ({ ...monitor, currentInput: null }));
  } catch { return null; }
}

function sameMonitorTopology(monitors: MonitorInfo[], ids: string[]) {
  if (monitors.length !== ids.length) return false;
  const cachedIds = monitors.map(monitor => monitor.id).sort();
  const detectedIds = [...ids].sort();
  return cachedIds.every((id, index) => id === detectedIds[index]);
}

function hex(value: number) { return `0x${value.toString(16).toUpperCase().padStart(2, "0")}`; }

export default function App() {
  const [monitorCache] = useState(readMonitorCache);
  const [page, setPage] = useState<Page>("devices");
  const [monitors, setMonitors] = useState<MonitorInfo[]>(() => monitorCache || []);
  const [preferences, setPreferences] = useState<Preferences>(readPreferences);
  const [scanning, setScanning] = useState(!monitorCache);
  const [initialScanComplete, setInitialScanComplete] = useState(Boolean(monitorCache));
  const startupProbeStarted = useRef(false);
  const [switchingDevice, setSwitchingDevice] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [shortcutWarning, setShortcutWarning] = useState<string | null>(null);
  const [newDeviceName, setNewDeviceName] = useState("");
  const [autostart, setAutostart] = useState(false);
  const [autostartLoading, setAutostartLoading] = useState(true);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); }, [preferences]);
  useEffect(() => {
    const theme = THEMES[preferences.theme || "cyan"];
    document.documentElement.style.setProperty("--primary", theme.primary);
    document.documentElement.style.setProperty("--ring", theme.ring);
  }, [preferences.theme]);

  const scan = useCallback(async (showSuccess = false) => {
    setScanning(true); setNotice(null);
    try {
      const result = await invoke<MonitorInfo[]>("scan_monitors");
      setMonitors(result);
      if (result.length > 0) localStorage.setItem(MONITOR_CACHE_KEY, JSON.stringify({ version: 1, monitors: result }));
      else localStorage.removeItem(MONITOR_CACHE_KEY);
      if (result.length === 0) {
        setNotice({ type: "error", text: "没有找到可访问的物理显示器，请检查连接和显卡驱动", page: "monitors" });
      } else if (showSuccess) {
        setNotice({ type: "success", text: `扫描完成，找到 ${result.length} 台物理显示器`, page: "monitors" });
      }
    } catch (error) { setNotice({ type: "error", text: String(error), page: "monitors" }); }
    finally { setScanning(false); setInitialScanComplete(true); }
  }, []);

  useEffect(() => {
    if (startupProbeStarted.current) return;
    startupProbeStarted.current = true;
    if (!monitorCache) { void scan(false); return; }

    void invoke<string[]>("probe_monitors")
      .then(ids => { if (!sameMonitorTopology(monitorCache, ids)) void scan(false); })
      .catch(() => undefined);
  }, [monitorCache, scan]);
  useEffect(() => { isAutostartEnabled().then(setAutostart).catch(error => setNotice({ type: "error", text: `读取开机启动状态失败：${String(error)}` })).finally(() => setAutostartLoading(false)); }, []);

  const assignmentsForDevice = useCallback((deviceId: string) => {
    const routes: Array<{ monitor: MonitorInfo; input: number; inputName: string }> = [];
    for (const monitor of monitors) {
      const assignments = preferences.monitors[monitor.id]?.assignments || {};
      for (const source of monitor.inputs) {
        if (assignments[String(source.value)] === deviceId) routes.push({ monitor, input: source.value, inputName: source.name });
      }
    }
    return routes;
  }, [monitors, preferences.monitors]);

  const switchDevice = useCallback(async (deviceId: string) => {
    const device = preferences.devices.find(item => item.id === deviceId);
    const routes = assignmentsForDevice(deviceId);
    if (routes.length === 0) { setNotice({ type: "error", text: `${device?.name || "该设备"} 还没有分配任何显示器端口` }); return; }
    setSwitchingDevice(deviceId);
    const results = await Promise.allSettled(routes.map(route => invoke("switch_input", { request: { monitorId: route.monitor.id, input: route.input } })));
    const succeeded = results.flatMap((result, index) => result.status === "fulfilled" ? [routes[index]] : []);
    const failed = results.flatMap((result, index) => result.status === "rejected" ? [`${preferences.monitors[routes[index].monitor.id]?.alias || routes[index].monitor.description}：${String(result.reason)}`] : []);
    setMonitors(current => current.map(monitor => {
      const route = succeeded.find(item => item.monitor.id === monitor.id);
      return route ? { ...monitor, currentInput: route.input } : monitor;
    }));
    setNotice(failed.length ? { type: "error", text: `${device?.name || "设备"} 部分切换失败：${failed.join("；")}` } : { type: "success", text: `已将 ${succeeded.length} 台显示器切换到 ${device?.name || "设备"}` });
    setSwitchingDevice(null);
  }, [assignmentsForDevice, preferences.devices, preferences.monitors]);

  useEffect(() => {
    let cancelled = false;
    const revision = ++shortcutSyncState.revision;
    const bound = preferences.devices.filter(device => device.shortcut);

    shortcutSyncState.queue = shortcutSyncState.queue.catch(() => undefined).then(async () => {
      // StrictMode and HMR can schedule overlapping effects. Only the latest snapshot
      // may mutate the process-wide shortcut registrations.
      if (revision !== shortcutSyncState.revision) return;
      try {
        await unregisterAll();
        const duplicate = bound.find((device, index) => bound.findIndex(item => item.shortcut === device.shortcut) !== index);
        if (duplicate) throw new Error(`快捷键 ${duplicate.shortcut} 被重复绑定`);
        for (const device of bound) {
          if (revision !== shortcutSyncState.revision) return;
          await register(device.shortcut!, event => { if (event.state === "Pressed") switchDevice(device.id); });
        }
        if (!cancelled) setShortcutWarning(null);
      } catch (error) { if (!cancelled) setShortcutWarning(`快捷键注册失败：${String(error)}`); }
    });
    return () => { cancelled = true; };
  }, [preferences.devices, switchDevice]);

  function updateDevice(deviceId: string, values: Partial<Device>) {
    setPreferences(current => ({ ...current, devices: current.devices.map(device => device.id === deviceId ? { ...device, ...values } : device) }));
  }

  function createDevice() {
    const name = newDeviceName.trim();
    if (!name) return;
    setPreferences(current => ({ ...current, devices: [...current.devices, { id: id(), name }] }));
    setNewDeviceName("");
  }

  function removeDevice(device: Device) {
    setPreferences(current => ({
      ...current,
      devices: current.devices.filter(item => item.id !== device.id),
      monitors: Object.fromEntries(Object.entries(current.monitors).map(([monitorId, monitor]) => [monitorId, { ...monitor, assignments: Object.fromEntries(Object.entries(monitor.assignments).filter(([, assigned]) => assigned !== device.id)) }]))
    }));
  }

  function updateMonitor(monitorId: string, updater: (monitor: MonitorPreference) => void) {
    setPreferences(current => {
      const next = structuredClone(current);
      const monitor = next.monitors[monitorId] ||= { assignments: {} };
      updater(monitor);
      return next;
    });
  }

  function assignDevice(monitorId: string, input: number, deviceId: string) {
    updateMonitor(monitorId, monitor => {
      if (deviceId === "unassigned") { delete monitor.assignments[String(input)]; return; }
      for (const [key, assigned] of Object.entries(monitor.assignments)) {
        if (assigned === deviceId) delete monitor.assignments[key];
      }
      monitor.assignments[String(input)] = deviceId;
    });
  }

  async function toggleAutostart(enabled: boolean) {
    setAutostartLoading(true);
    try {
      if (enabled) await enableAutostart(); else await disableAutostart();
      setAutostart(await isAutostartEnabled());
    } catch (error) { setNotice({ type: "error", text: `修改开机启动失败：${String(error)}` }); }
    finally { setAutostartLoading(false); }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <WindowTitlebar />
      <div className="relative flex min-h-screen pt-10">
        <aside className="sidebar">
          <div className="flex items-center gap-3 px-3 pb-7 pt-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"><MonitorCog className="h-5 w-5" /></div>
            <div><h1 className="font-bold tracking-tight">SoftKVM</h1><p className="text-[11px] text-muted-foreground">显示器信号切换</p></div>
          </div>
          <nav className="space-y-1">
            <NavItem active={page === "devices"} icon={<Cpu />} label="设备管理" badge={preferences.devices.length} onClick={() => setPage("devices")} />
            <NavItem active={page === "monitors"} icon={<LayoutGrid />} label="显示器管理" badge={monitors.length} onClick={() => setPage("monitors")} />
            <NavItem active={page === "settings"} icon={<Settings />} label="设置" onClick={() => setPage("settings")} />
          </nav>
        </aside>

        <section className="min-w-0 flex-1 px-6 py-8 lg:px-10">
          <div className="mx-auto max-w-5xl">
            <PageHeader page={page} scanning={scanning} onScan={scan} />
            {notice && (!notice.page || notice.page === page) && <Alert className={`mb-5 flex items-center gap-3 pr-2 ${notice.type === "error" ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"}`}>{notice.type === "error" ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}<span className="flex-1">{notice.text}</span><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 hover:bg-black/5" title="关闭提示" aria-label="关闭提示" onClick={() => setNotice(null)}><X className="h-3.5 w-3.5" /></Button></Alert>}
            {shortcutWarning && <Alert className="mb-5 flex items-center gap-3 border-amber-500/30 bg-amber-500/5 pr-2 text-amber-700"><AlertCircle className="h-4 w-4 shrink-0" /><span className="flex-1">{shortcutWarning}</span><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 hover:bg-black/5" title="关闭提示" aria-label="关闭提示" onClick={() => setShortcutWarning(null)}><X className="h-3.5 w-3.5" /></Button></Alert>}
            {!initialScanComplete ? <InitialScanState /> : <>
              {page === "devices" && <DevicePage devices={preferences.devices} monitors={monitors} preferences={preferences} newName={newDeviceName} setNewName={setNewDeviceName} createDevice={createDevice} updateDevice={updateDevice} removeDevice={removeDevice} switchDevice={switchDevice} switchingDevice={switchingDevice} assignmentsForDevice={assignmentsForDevice} />}
              {page === "monitors" && <MonitorPage monitors={monitors} devices={preferences.devices} preferences={preferences} scanning={scanning} scan={() => scan(true)} updateMonitor={updateMonitor} assignDevice={assignDevice} />}
              {page === "settings" && <SettingsPage autostart={autostart} loading={autostartLoading} toggle={toggleAutostart} theme={preferences.theme || "cyan"} setTheme={theme => setPreferences(current => ({ ...current, theme }))} />}
            </>}
          </div>
        </section>
      </div>
    </main>
  );
}

function InitialScanState() {
  return <Card className="border-dashed bg-card/70"><CardContent className="flex min-h-80 flex-col items-center justify-center px-6 py-14 text-center">
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Loader2 className="h-6 w-6 animate-spin" /></div>
    <CardTitle className="mt-5">正在扫描显示器</CardTitle>
    <CardDescription className="mt-2 max-w-sm">正在通过 DDC/CI 读取物理显示器和输入源信息。部分显示器响应较慢，请稍候。</CardDescription>
    <p className="mt-5 text-xs text-muted-foreground">检测中…</p>
  </CardContent></Card>;
}

function WindowTitlebar() {
  return <header
    className="window-titlebar"
    data-tauri-drag-region
  >
    <div className="flex min-w-0 items-center gap-2 px-3 text-xs font-medium text-muted-foreground" data-tauri-drag-region>
      <MonitorCog className="h-3.5 w-3.5 text-primary" />
      <span data-tauri-drag-region>SoftKVM</span>
    </div>
    <div className="flex h-full items-center">
      <Button variant="ghost" size="icon" className="titlebar-button" title="最小化" aria-label="最小化窗口" onClick={() => appWindow.minimize()}><Minus className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" className="titlebar-button titlebar-close" title="关闭" aria-label="关闭窗口" onClick={() => appWindow.close()}><X className="h-4 w-4" /></Button>
    </div>
  </header>;
}

function NavItem({ active, icon, label, badge, onClick }: { active: boolean; icon: React.ReactNode; label: string; badge?: number; onClick: () => void }) {
  return <button onClick={onClick} className={`nav-item ${active ? "nav-item-active" : ""}`}><span>{icon}</span><span className="flex-1 text-left">{label}</span>{badge != null && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{badge}</span>}</button>;
}

function PageHeader({ page, scanning, onScan }: { page: Page; scanning: boolean; onScan: (showSuccess?: boolean) => void }) {
  const content = { devices: ["设备管理", "创建设备，为每个设备分配显示器端口和切换快捷键"], monitors: ["显示器管理", "扫描显示器，并把每个物理接口分配给设备"], settings: ["设置", "配置 SoftKVM 的系统行为"] }[page];
  return <header className="mb-7 flex items-start justify-between gap-4"><div><h2 className="text-2xl font-bold tracking-tight">{content[0]}</h2><p className="mt-1 text-sm text-muted-foreground">{content[1]}</p></div>{page === "monitors" && <Button variant="outline" onClick={() => onScan(true)} disabled={scanning}>{scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}重新扫描</Button>}</header>;
}

function DevicePage({ devices, monitors, preferences, newName, setNewName, createDevice, updateDevice, removeDevice, switchDevice, switchingDevice, assignmentsForDevice }: {
  devices: Device[]; monitors: MonitorInfo[]; preferences: Preferences; newName: string; setNewName: (value: string) => void; createDevice: () => void; updateDevice: (id: string, values: Partial<Device>) => void; removeDevice: (device: Device) => void; switchDevice: (id: string) => void; switchingDevice: string | null; assignmentsForDevice: (id: string) => Array<{ monitor: MonitorInfo; input: number; inputName: string }>;
}) {
  const [deviceToDelete, setDeviceToDelete] = useState<Device | null>(null);
  return <div className="space-y-5">
    <Card className="border-dashed bg-card/60"><CardContent className="flex flex-wrap items-end gap-3 p-4"><div className="min-w-56 flex-1"><Label htmlFor="new-device">新设备名称</Label><Input id="new-device" className="mt-2" placeholder="例如：PC 1、Xbox、Nintendo Switch" value={newName} onChange={event => setNewName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") createDevice(); }} /></div><Button onClick={createDevice} disabled={!newName.trim()}><Plus className="h-4 w-4" />创建设备</Button></CardContent></Card>
    {devices.length === 0 && <Empty icon={<Cpu />} title="还没有设备" description="先新建 PC、游戏机等设备，再到“显示器管理”把端口分配给它。" />}
    <div className="grid gap-4 xl:grid-cols-2">
      {devices.map(device => {
        const routes = assignmentsForDevice(device.id);
        return <Card key={device.id} className="bg-card/90 backdrop-blur"><CardHeader className="pb-4"><div className="flex items-start gap-3"><div className="device-icon"><Cpu className="h-5 w-5" /></div><div className="min-w-0 flex-1"><Input value={device.name} onChange={event => updateDevice(device.id, { name: event.target.value })} className="h-9 border-transparent bg-transparent px-1 text-lg font-semibold hover:border-input focus:border-input" /><CardDescription className="px-1">已分配 {routes.length} 台显示器</CardDescription></div><Button variant="ghost" size="icon" title={`删除 ${device.name}`} className="text-muted-foreground hover:text-destructive" onClick={() => setDeviceToDelete(device)}><Trash2 className="h-4 w-4" /></Button></div></CardHeader><Separator /><CardContent className="space-y-4 pt-4">
          <div><Label className="text-xs text-muted-foreground">端口映射</Label><div className="mt-2 flex min-h-8 flex-wrap gap-2">{routes.length ? routes.map(route => <Badge key={`${route.monitor.id}:${route.input}`} variant="secondary">{preferences.monitors[route.monitor.id]?.alias || route.monitor.description} · {route.inputName}</Badge>) : <span className="text-xs text-muted-foreground">尚未分配，请前往显示器管理</span>}</div></div>
          <div className="flex flex-wrap items-center justify-between gap-3"><HotkeyInput value={device.shortcut} onChange={shortcut => updateDevice(device.id, { shortcut })} /><Button onClick={() => switchDevice(device.id)} disabled={switchingDevice === device.id || routes.length === 0}>{switchingDevice === device.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}切换到此设备</Button></div>
        </CardContent></Card>;
      })}
    </div>
    {devices.length > 0 && monitors.length === 0 && <Alert className="flex items-center gap-2 text-muted-foreground"><AlertCircle className="h-4 w-4" />未扫描到显示器，设备端口映射可能暂时无法显示。</Alert>}
    <AlertDialog open={deviceToDelete !== null} onOpenChange={open => { if (!open) setDeviceToDelete(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除设备“{deviceToDelete?.name}”？</AlertDialogTitle>
          <AlertDialogDescription>这个操作会同时清除该设备在所有显示器上的端口分配和快捷键配置。显示器本身不会受到影响。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => { if (deviceToDelete) removeDevice(deviceToDelete); setDeviceToDelete(null); }}>确认删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

function MonitorPage({ monitors, devices, preferences, scanning, scan, updateMonitor, assignDevice }: { monitors: MonitorInfo[]; devices: Device[]; preferences: Preferences; scanning: boolean; scan: () => void; updateMonitor: (id: string, updater: (monitor: MonitorPreference) => void) => void; assignDevice: (monitorId: string, input: number, deviceId: string) => void }) {
  if (!scanning && monitors.length === 0) return <Empty icon={<MonitorCog />} title="没有发现显示器" description="确认显示器已连接且在 OSD 菜单中启用了 DDC/CI。" action={<Button onClick={scan}><ScanLine className="h-4 w-4" />扫描显示器</Button>} />;
  return <div className="space-y-5">{monitors.map((monitor, index) => {
    const config = preferences.monitors[monitor.id];
    const expanded = monitor.capabilitiesDetected || config?.compatibilityExpanded;
    return <Card key={monitor.id} className="overflow-hidden bg-card/90 backdrop-blur"><CardHeader className="pb-4"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="mb-2 flex items-center gap-2"><Badge variant={monitor.capabilitiesDetected ? "success" : "secondary"}>{monitor.capabilitiesDetected ? "已识别输入源" : "兼容模式"}</Badge><span className="text-xs text-muted-foreground">显示器 {index + 1}</span></div><Input value={config?.alias ?? monitor.description} onChange={event => updateMonitor(monitor.id, item => { item.alias = event.target.value; })} className="h-9 max-w-sm border-transparent bg-transparent px-1 text-lg font-semibold hover:border-input focus:border-input" aria-label="显示器名称" /><CardDescription className="px-1">{monitor.description} · 物理通道 {monitor.physicalIndex + 1}</CardDescription></div>{monitor.currentInput != null && <Badge variant="outline">当前 {hex(monitor.currentInput)}</Badge>}</div></CardHeader><Separator /><CardContent className="pt-5">
      {!monitor.capabilitiesDetected && <button className="compatibility-toggle" onClick={() => updateMonitor(monitor.id, item => { item.compatibilityExpanded = !item.compatibilityExpanded; })}>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}<span className="flex-1 text-left"><strong>扫描失败时的兼容输入源</strong><small>{expanded ? "这些是常见候选值，可随时折叠" : `已隐藏 ${monitor.inputs.length} 个候选端口，点击展开`}</small></span></button>}
      {expanded && <div className="mt-3 space-y-2">{monitor.inputs.map(source => {
        const assigned = config?.assignments?.[String(source.value)] || "unassigned";
        const active = monitor.currentInput === source.value;
        return <div key={source.value} className={`assignment-row ${active ? "assignment-row-active" : ""}`}><div className="flex min-w-40 flex-1 items-center gap-3"><span className={`h-2 w-2 rounded-full ${active ? "bg-emerald-500" : "bg-muted-foreground/25"}`} /><div><p className="text-sm font-medium">{source.name}</p><p className="font-mono text-[10px] text-muted-foreground">VCP {hex(source.value)}</p></div></div><div className="w-full sm:w-64"><Select value={assigned} onValueChange={value => assignDevice(monitor.id, source.value, value)}><SelectTrigger><SelectValue placeholder="未分配设备" /></SelectTrigger><SelectContent><SelectItem value="unassigned">未分配</SelectItem>{devices.map(device => <SelectItem key={device.id} value={device.id}>{device.name}</SelectItem>)}</SelectContent></Select></div></div>;
      })}</div>}
      {expanded && devices.length === 0 && <p className="mt-3 text-xs text-muted-foreground">还没有可分配的设备，请先在设备管理中创建。</p>}
      <details className="mt-4 text-xs text-muted-foreground"><summary className="cursor-pointer select-none hover:text-foreground">技术信息</summary><pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-[10px]">{monitor.capabilities || "显示器未返回 capabilities 字符串"}</pre></details>
    </CardContent></Card>;
  })}</div>;
}

function SettingsPage({ autostart, loading, toggle, theme, setTheme }: { autostart: boolean; loading: boolean; toggle: (enabled: boolean) => void; theme: ThemeColor; setTheme: (theme: ThemeColor) => void }) {
  return <div className="max-w-2xl space-y-5">
    <Card className="bg-card/90"><CardHeader><CardTitle>外观</CardTitle><CardDescription>选择应用的强调色，按钮、选中状态和焦点边框会同步更新。</CardDescription></CardHeader><Separator /><CardContent className="pt-5"><Label className="text-base">主题色</Label><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">{(Object.entries(THEMES) as Array<[ThemeColor, typeof THEMES[ThemeColor]]>).map(([value, option]) => <button key={value} type="button" className={`theme-option ${theme === value ? "theme-option-active" : ""}`} onClick={() => setTheme(value)} aria-pressed={theme === value}><span className={`h-5 w-5 rounded-full ${option.preview}`} /><span>{option.label}</span>{theme === value && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}</button>)}</div></CardContent></Card>
    <Card className="bg-card/90"><CardHeader><CardTitle>系统行为</CardTitle><CardDescription>控制 SoftKVM 如何随 Windows 运行。</CardDescription></CardHeader><Separator /><CardContent className="pt-5"><div className="flex items-center justify-between gap-5"><div><Label htmlFor="autostart" className="text-base">开机自动启动</Label><p className="mt-1 text-sm text-muted-foreground">登录 Windows 后自动运行 SoftKVM，让设备快捷键随时可用。</p></div><Switch id="autostart" checked={autostart} disabled={loading} onCheckedChange={toggle} /></div></CardContent></Card>
  </div>;
}

function Empty({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return <Card className="border-dashed"><CardContent className="flex flex-col items-center px-6 py-14 text-center"><div className="mb-4 rounded-2xl bg-muted p-4 text-muted-foreground [&>svg]:h-7 [&>svg]:w-7">{icon}</div><CardTitle>{title}</CardTitle><CardDescription className="mt-2 max-w-md">{description}</CardDescription>{action && <div className="mt-5">{action}</div>}</CardContent></Card>;
}
