use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputSource {
    pub value: u32,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub id: String,
    pub description: String,
    pub display_index: usize,
    pub physical_index: usize,
    pub current_input: Option<u32>,
    pub inputs: Vec<InputSource>,
    pub capabilities_detected: bool,
    pub capabilities: Option<String>,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchRequest {
    pub monitor_id: String,
    pub input: u32,
}

#[derive(Debug, thiserror::Error)]
pub enum MonitorError {
    #[cfg(not(target_os = "windows"))]
    #[error("此平台暂不支持 DDC/CI；当前版本仅支持 Windows")]
    UnsupportedPlatform,
    #[error("未找到显示器 {0}，它可能已断开或显示拓扑已改变，请重新扫描")]
    MonitorNotFound(String),
    #[error("无效的显示器输入源值 {0}；有效范围为 1 到 255")]
    InvalidInput(u32),
    #[error("{0}（Windows 错误码 {1}）")]
    Windows(&'static str, u32),
}

#[cfg(not(target_os = "windows"))]
pub fn scan() -> Result<Vec<MonitorInfo>, MonitorError> {
    Err(MonitorError::UnsupportedPlatform)
}

#[cfg(not(target_os = "windows"))]
pub fn probe() -> Result<Vec<String>, MonitorError> {
    Err(MonitorError::UnsupportedPlatform)
}

#[cfg(not(target_os = "windows"))]
pub fn switch_input(_: &SwitchRequest) -> Result<(), MonitorError> {
    Err(MonitorError::UnsupportedPlatform)
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use super::*;
    use std::{mem, ptr};
    use windows_sys::Win32::{
        Foundation::{GetLastError, BOOL, HANDLE, LPARAM, RECT},
        Graphics::Gdi::{
            EnumDisplayDevicesW, EnumDisplayMonitors, GetMonitorInfoW, DISPLAY_DEVICEW, HDC,
            HMONITOR, MONITORINFOEXW,
        },
    };
    use winreg::{enums::HKEY_LOCAL_MACHINE, RegKey};

    const VCP_INPUT_SOURCE: u8 = 0x60;
    const DESCRIPTION_LEN: usize = 128;

    #[repr(C)]
    struct PhysicalMonitor {
        handle: HANDLE,
        description: [u16; DESCRIPTION_LEN],
    }

    #[link(name = "Dxva2")]
    extern "system" {
        fn GetNumberOfPhysicalMonitorsFromHMONITOR(monitor: HMONITOR, count: *mut u32) -> BOOL;
        fn GetPhysicalMonitorsFromHMONITOR(
            monitor: HMONITOR,
            size: u32,
            monitors: *mut PhysicalMonitor,
        ) -> BOOL;
        fn DestroyPhysicalMonitors(size: u32, monitors: *mut PhysicalMonitor) -> BOOL;
        fn GetCapabilitiesStringLength(monitor: HANDLE, length: *mut u32) -> BOOL;
        fn CapabilitiesRequestAndCapabilitiesReply(
            monitor: HANDLE,
            buffer: *mut u8,
            length: u32,
        ) -> BOOL;
        fn GetVCPFeatureAndVCPFeatureReply(
            monitor: HANDLE,
            code: u8,
            code_type: *mut u32,
            current: *mut u32,
            maximum: *mut u32,
        ) -> BOOL;
        fn SetVCPFeature(monitor: HANDLE, code: u8, value: u32) -> BOOL;
    }

    struct PhysicalList(Vec<PhysicalMonitor>);
    impl Drop for PhysicalList {
        fn drop(&mut self) {
            if !self.0.is_empty() {
                unsafe {
                    DestroyPhysicalMonitors(self.0.len() as u32, self.0.as_mut_ptr());
                }
            }
        }
    }

    #[derive(Clone, Copy)]
    struct LogicalMonitor {
        handle: HMONITOR,
        rect: RECT,
    }

    unsafe extern "system" fn enum_callback(
        monitor: HMONITOR,
        _: HDC,
        rect: *mut RECT,
        data: LPARAM,
    ) -> BOOL {
        let monitors = &mut *(data as *mut Vec<LogicalMonitor>);
        monitors.push(LogicalMonitor {
            handle: monitor,
            rect: *rect,
        });
        1
    }

    fn logical_monitors() -> Result<Vec<LogicalMonitor>, MonitorError> {
        let mut monitors = Vec::new();
        let ok = unsafe {
            EnumDisplayMonitors(
                ptr::null_mut(),
                ptr::null(),
                Some(enum_callback),
                &mut monitors as *mut _ as LPARAM,
            )
        };
        if ok == 0 {
            return Err(last_error("枚举 Windows 显示器失败"));
        }
        Ok(monitors)
    }

    fn physical_monitors(handle: HMONITOR) -> Result<PhysicalList, MonitorError> {
        let mut count = 0;
        if unsafe { GetNumberOfPhysicalMonitorsFromHMONITOR(handle, &mut count) } == 0 {
            return Err(last_error("无法获取物理显示器数量"));
        }
        if count == 0 {
            return Ok(PhysicalList(Vec::new()));
        }
        let mut raw = Vec::<PhysicalMonitor>::with_capacity(count as usize);
        let ok = unsafe { GetPhysicalMonitorsFromHMONITOR(handle, count, raw.as_mut_ptr()) };
        if ok == 0 {
            return Err(last_error("无法打开物理显示器"));
        }
        unsafe {
            raw.set_len(count as usize);
        }
        Ok(PhysicalList(raw))
    }

    fn monitor_id(
        description: &str,
        display_index: usize,
        physical_index: usize,
        rect: RECT,
    ) -> String {
        // This identity is stable across ordinary rescans and disambiguates identical models.
        let mut hash: u64 = 0xcbf29ce484222325;
        let value = format!(
            "{description}|{display_index}|{physical_index}|{}:{}:{}:{}",
            rect.left, rect.top, rect.right, rect.bottom
        );
        for byte in value.bytes() {
            hash ^= byte as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
        format!("monitor-{hash:016x}")
    }

    fn description(raw: &[u16]) -> String {
        let end = raw.iter().position(|c| *c == 0).unwrap_or(raw.len());
        String::from_utf16_lossy(&raw[..end]).trim().to_string()
    }

    fn display_device_details(handle: HMONITOR) -> Option<(String, String)> {
        let mut info: MONITORINFOEXW = unsafe { mem::zeroed() };
        info.monitorInfo.cbSize = mem::size_of::<MONITORINFOEXW>() as u32;
        if unsafe { GetMonitorInfoW(handle, &mut info.monitorInfo) } == 0 {
            return None;
        }

        let mut device: DISPLAY_DEVICEW = unsafe { mem::zeroed() };
        device.cb = mem::size_of::<DISPLAY_DEVICEW>() as u32;
        if unsafe { EnumDisplayDevicesW(info.szDevice.as_ptr(), 0, &mut device, 0) } == 0 {
            return None;
        }

        Some((
            description(&device.DeviceString),
            description(&device.DeviceID),
        ))
    }

    fn edid_model_name(device_id: &str) -> Option<String> {
        let model_code = device_id.split('\\').nth(1)?.trim();
        if model_code.is_empty() {
            return None;
        }
        let display_key = RegKey::predef(HKEY_LOCAL_MACHINE)
            .open_subkey(format!(
                r"SYSTEM\CurrentControlSet\Enum\DISPLAY\{model_code}"
            ))
            .ok()?;

        for instance in display_key.enum_keys().flatten() {
            let Ok(parameters) = display_key.open_subkey(format!(r"{instance}\Device Parameters"))
            else {
                continue;
            };
            let Ok(edid) = parameters.get_raw_value("EDID") else {
                continue;
            };
            if let Some(name) = parse_edid_model_name(&edid.bytes) {
                return Some(name);
            }
        }
        None
    }

    fn parse_edid_model_name(edid: &[u8]) -> Option<String> {
        if edid.len() < 128
            || edid.get(..8) != Some(&[0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00])
        {
            return None;
        }
        for descriptor in edid[54..126].chunks_exact(18) {
            if descriptor[..5] == [0x00, 0x00, 0x00, 0xfc, 0x00] {
                let end = descriptor[5..]
                    .iter()
                    .position(|byte| matches!(*byte, 0x00 | 0x0a | 0x0d))
                    .unwrap_or(13);
                let name = String::from_utf8_lossy(&descriptor[5..5 + end])
                    .trim()
                    .to_string();
                if !name.is_empty() {
                    return Some(name);
                }
            }
        }
        None
    }

    fn best_monitor_name(handle: HMONITOR, physical_description: &str) -> String {
        if let Some((windows_name, device_id)) = display_device_details(handle) {
            if let Some(edid_name) = edid_model_name(&device_id) {
                return edid_name;
            }
            let lower = windows_name.to_ascii_lowercase();
            if !windows_name.is_empty()
                && !lower.contains("generic pnp")
                && !lower.contains("generic non-pnp")
            {
                return windows_name;
            }
        }
        physical_description.to_string()
    }

    fn capabilities(handle: HANDLE) -> Option<String> {
        let mut len = 0;
        if unsafe { GetCapabilitiesStringLength(handle, &mut len) } == 0
            || !(2..=1_048_576).contains(&len)
        {
            return None;
        }
        let mut buffer = vec![0_u8; len as usize];
        if unsafe { CapabilitiesRequestAndCapabilitiesReply(handle, buffer.as_mut_ptr(), len) } == 0
        {
            return None;
        }
        let end = buffer
            .iter()
            .position(|byte| *byte == 0)
            .unwrap_or(buffer.len());
        Some(String::from_utf8_lossy(&buffer[..end]).into_owned())
    }

    fn input_values(capabilities: &str) -> Vec<u32> {
        let lower = capabilities.to_ascii_lowercase();
        let Some(vcp_start) = lower.find("vcp(") else {
            return Vec::new();
        };
        let bytes = lower.as_bytes();
        let mut depth = 1_i32;
        let mut index = vcp_start + 4;
        while index + 1 < bytes.len() {
            if bytes[index] == b'(' {
                // Input Source is represented as 60(value value ...).
                let token_start = lower[..index]
                    .rfind(|c: char| c.is_ascii_whitespace() || c == '(')
                    .map(|v| v + 1)
                    .unwrap_or(0);
                if lower[token_start..index].trim() == "60" {
                    let mut end = index + 1;
                    let mut inner_depth = 1;
                    while end < bytes.len() && inner_depth > 0 {
                        if bytes[end] == b'(' {
                            inner_depth += 1;
                        }
                        if bytes[end] == b')' {
                            inner_depth -= 1;
                        }
                        end += 1;
                    }
                    return lower[index + 1..end.saturating_sub(1)]
                        .split_whitespace()
                        .filter_map(|value| {
                            u32::from_str_radix(
                                value.trim_matches(|c: char| !c.is_ascii_hexdigit()),
                                16,
                            )
                            .ok()
                        })
                        .collect();
                }
                depth += 1;
            } else if bytes[index] == b')' {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            index += 1;
        }
        Vec::new()
    }

    fn input_name(value: u32) -> String {
        match value {
            0x01 => "VGA 1",
            0x02 => "VGA 2",
            0x03 => "DVI 1",
            0x04 => "DVI 2",
            0x05 => "Composite 1",
            0x06 => "Composite 2",
            0x07 => "S-Video 1",
            0x08 => "S-Video 2",
            0x09 => "Tuner 1",
            0x0A => "Tuner 2",
            0x0B => "Tuner 3",
            0x0C => "Component 1",
            0x0D => "Component 2",
            0x0F => "DisplayPort 1",
            0x10 => "DisplayPort 2",
            0x11 => "HDMI 1",
            0x12 => "HDMI 2",
            0x1B => "Digital Video",
            _ => return format!("输入源 0x{value:02X}"),
        }
        .to_string()
    }

    fn current_input(handle: HANDLE) -> Option<u32> {
        let (mut kind, mut current, mut maximum) = (0, 0, 0);
        let ok = unsafe {
            GetVCPFeatureAndVCPFeatureReply(
                handle,
                VCP_INPUT_SOURCE,
                &mut kind,
                &mut current,
                &mut maximum,
            )
        };
        (ok != 0).then_some(current)
    }

    fn last_error(context: &'static str) -> MonitorError {
        MonitorError::Windows(context, unsafe { GetLastError() })
    }

    pub fn scan() -> Result<Vec<MonitorInfo>, MonitorError> {
        let mut result = Vec::new();
        for (display_index, logical) in logical_monitors()?.into_iter().enumerate() {
            let physical = match physical_monitors(logical.handle) {
                Ok(value) => value,
                Err(_) => continue,
            };
            for (physical_index, item) in physical.0.iter().enumerate() {
                let physical_name = description(&item.description);
                let name = best_monitor_name(logical.handle, &physical_name);
                let caps = capabilities(item.handle);
                let detected_values = caps.as_deref().map(input_values).unwrap_or_default();
                let capabilities_detected = !detected_values.is_empty();
                // Some otherwise working monitors omit VCP 60 values from capabilities.
                let values = if capabilities_detected {
                    detected_values
                } else {
                    vec![0x01, 0x03, 0x0F, 0x10, 0x11, 0x12]
                };
                result.push(MonitorInfo {
                    // Keep the original physical description in the identity hash so existing
                    // aliases and device assignments survive the richer EDID display name.
                    id: monitor_id(&physical_name, display_index, physical_index, logical.rect),
                    description: if name.is_empty() {
                        format!("显示器 {}", display_index + 1)
                    } else {
                        name
                    },
                    display_index,
                    physical_index,
                    current_input: current_input(item.handle),
                    inputs: values
                        .into_iter()
                        .map(|value| InputSource {
                            value,
                            name: input_name(value),
                        })
                        .collect(),
                    capabilities_detected,
                    capabilities: caps,
                    warning: (!capabilities_detected).then(|| {
                        "显示器未上报输入源列表，已显示常见输入源；请只测试实际存在的接口".into()
                    }),
                });
            }
        }
        Ok(result)
    }

    pub fn probe() -> Result<Vec<String>, MonitorError> {
        let mut result = Vec::new();
        for (display_index, logical) in logical_monitors()?.into_iter().enumerate() {
            let physical = match physical_monitors(logical.handle) {
                Ok(value) => value,
                Err(_) => continue,
            };
            for (physical_index, item) in physical.0.iter().enumerate() {
                result.push(monitor_id(
                    &description(&item.description),
                    display_index,
                    physical_index,
                    logical.rect,
                ));
            }
        }
        Ok(result)
    }

    pub fn switch_input(request: &SwitchRequest) -> Result<(), MonitorError> {
        if !(1..=u8::MAX as u32).contains(&request.input) {
            return Err(MonitorError::InvalidInput(request.input));
        }
        for (display_index, logical) in logical_monitors()?.into_iter().enumerate() {
            let mut physical = match physical_monitors(logical.handle) {
                Ok(value) => value,
                Err(_) => continue,
            };
            for (physical_index, item) in physical.0.iter_mut().enumerate() {
                let name = description(&item.description);
                if monitor_id(&name, display_index, physical_index, logical.rect)
                    == request.monitor_id
                {
                    if unsafe { SetVCPFeature(item.handle, VCP_INPUT_SOURCE, request.input) } == 0 {
                        return Err(last_error(
                            "显示器拒绝切换输入源；请确认已在显示器菜单中启用 DDC/CI",
                        ));
                    }
                    return Ok(());
                }
            }
        }
        Err(MonitorError::MonitorNotFound(request.monitor_id.clone()))
    }

    #[cfg(test)]
    mod tests {
        use super::{input_values, parse_edid_model_name};

        #[test]
        fn parses_input_source_values_from_capabilities() {
            let caps = "(prot(monitor)type(lcd)vcp(10 12 60(0f 10 11 12) d6(01 04)))";
            assert_eq!(input_values(caps), vec![0x0f, 0x10, 0x11, 0x12]);
        }

        #[test]
        fn handles_capabilities_without_input_source() {
            assert!(input_values("(prot(monitor)vcp(10 12 d6(01 04)))").is_empty());
        }

        #[test]
        fn parses_model_name_from_edid_descriptor() {
            let mut edid = vec![0_u8; 128];
            edid[..8].copy_from_slice(&[0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00]);
            edid[54..59].copy_from_slice(&[0x00, 0x00, 0x00, 0xfc, 0x00]);
            edid[59..71].copy_from_slice(b"DELL U2723QE");
            edid[71] = 0x0a;
            assert_eq!(
                parse_edid_model_name(&edid).as_deref(),
                Some("DELL U2723QE")
            );
        }
    }
}

#[cfg(target_os = "windows")]
pub use windows_impl::{probe, scan, switch_input};
