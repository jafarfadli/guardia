import Foundation
import IOKit

// Battery levels for the dials on the board above the desk: the Mac, the iPhone, the AirPods and
// one more (an iPad, a Magic Mouse, Keyboard or Trackpad). Four dials, always in that order, so
// each device keeps its own; one that is away shows a parked needle.
// - the Mac: IOPowerSources (Power.read)
// - Magic Mouse, Keyboard, Trackpad: IOKit's BatteryPercent
// - AirPods while connected: the Bluetooth report macOS keeps (system_profiler)
// - iPhone and iPad: macOS's own device link (MobileDevice, as Finder uses), over a cable or over
//   Wi-Fi once "Show this iPhone when on Wi-Fi" is ticked in Finder. Read only, never pairs.
final class Batteries {
    struct Device { var name: String; var percent: Int?; var charging = false; var seen = Date() }
    var onChange: (([[String: Any]]) -> Void)?
    private var timer: Timer?
    private var podsTimer: Timer?
    private var hid: [Device] = []
    private var pods: Device?
    private let ios = MobileDevices()

    func start() {
        ios.onChange = { [weak self] in self?.publish() }
        ios.start()
        poll()
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in self?.poll() }
        timer?.tolerance = 10
        podsTimer = Timer.scheduledTimer(withTimeInterval: 180, repeats: true) { [weak self] _ in self?.pollPods() }
        pollPods()
    }

    private var polls = 0
    private func poll() {
        hid = Batteries.hidDevices()
        // asking a phone over Wi-Fi wakes its radio: every five minutes is plenty
        if polls % 5 == 0 { ios.refresh() }
        polls += 1
        publish()
    }

    private func pollPods() {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let p = Batteries.airPods()
            DispatchQueue.main.async { self?.pods = p; self?.publish() }
        }
    }

    func publish() {
        let mac = Power.read()
        var dials: [[String: Any]] = [["name": "MAC", "percent": mac.percent, "charging": mac.charging]]
        let phones = ios.devices
        let phone = phones.first { $0.kind == "iPhone" }
        dials.append(Batteries.dial("IPHONE", phone.map { Device(name: $0.name, percent: $0.percent, charging: $0.charging, seen: $0.seen) }))
        dials.append(Batteries.dial("AIRPODS", pods))
        let other = phones.first { $0.kind == "iPad" }.map { Device(name: "IPAD", percent: $0.percent, charging: $0.charging, seen: $0.seen) } ?? hid.first
        dials.append(Batteries.dial(other?.name ?? "LAINNYA", other))
        onChange?(dials)
    }

    private static func dial(_ name: String, _ d: Device?) -> [String: Any] {
        guard let d, let p = d.percent else { return ["name": name, "percent": NSNull()] }
        // a reading older than half an hour is shown faded
        return ["name": name, "percent": p, "charging": d.charging, "stale": Date().timeIntervalSince(d.seen) > 1800]
    }

    // ------------------------------------------------------------------ Magic Mouse, Keyboard, Trackpad
    static func hidDevices() -> [Device] {
        var out: [Device] = []
        var it: io_iterator_t = 0
        guard IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("AppleDeviceManagementHIDEventService"), &it) == KERN_SUCCESS else { return [] }
        defer { IOObjectRelease(it) }
        while case let s = IOIteratorNext(it), s != 0 {
            defer { IOObjectRelease(s) }
            var props: Unmanaged<CFMutableDictionary>?
            guard IORegistryEntryCreateCFProperties(s, &props, kCFAllocatorDefault, 0) == KERN_SUCCESS,
                  let d = props?.takeRetainedValue() as? [String: Any], let pct = d["BatteryPercent"] as? Int else { continue }
            let product = (d["Product"] as? String ?? "").lowercased()
            let name = product.contains("mouse") ? "MOUSE" : product.contains("keyboard") ? "KEYBOARD" : product.contains("trackpad") ? "TRACKPAD" : "LAINNYA"
            out.append(Device(name: name, percent: pct))
        }
        return out
    }

    // ------------------------------------------------------------------ AirPods
    static func airPods() -> Device? {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/sbin/system_profiler")
        p.arguments = ["SPBluetoothDataType", "-json"]
        let out = Pipe()
        p.standardOutput = out
        p.standardError = FileHandle.nullDevice
        guard (try? p.run()) != nil else { return nil }
        let data = out.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        guard let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let bt = (j["SPBluetoothDataType"] as? [[String: Any]])?.first,
              let connected = bt["device_connected"] as? [[String: Any]] else { return nil }
        let level = { (s: Any?) -> Int? in (s as? String).flatMap { Int($0.replacingOccurrences(of: "%", with: "").trimmingCharacters(in: .whitespaces)) } }
        for entry in connected {
            for (_, v) in entry {
                guard let info = v as? [String: Any] else { continue }
                let buds = [level(info["device_batteryLevelLeft"]), level(info["device_batteryLevelRight"])].compactMap { $0 }
                if let low = buds.min() { return Device(name: "AIRPODS", percent: low) }
                if let main = level(info["device_batteryLevelMain"]) { return Device(name: "AIRPODS", percent: main) }
            }
        }
        return nil
    }
}

// ------------------------------------------------------------------ iPhone and iPad
// macOS's private MobileDevice framework, loaded at run time. Devices this Mac already trusts
// show up over a cable, or over Wi-Fi when Finder's "Show this iPhone when on Wi-Fi" is on.
final class MobileDevices {
    struct Phone { let id: String; var name: String; var kind: String; var percent: Int?; var charging: Bool; var seen: Date }
    private(set) var devices: [Phone] = []
    var onChange: (() -> Void)?

    private typealias Callback = @convention(c) (UnsafeMutableRawPointer?, UnsafeMutableRawPointer?) -> Void
    private typealias Subscribe = @convention(c) (Callback, UInt32, UInt32, UnsafeMutableRawPointer?, UnsafeMutablePointer<OpaquePointer?>, CFDictionary?) -> Int32
    private typealias DevInt = @convention(c) (OpaquePointer) -> Int32
    private typealias DevVoid = @convention(c) (OpaquePointer) -> Void
    private typealias Copy = @convention(c) (OpaquePointer, CFString?, CFString?) -> Unmanaged<CFTypeRef>?
    private typealias CopyID = @convention(c) (OpaquePointer) -> Unmanaged<CFString>?
    private struct API {
        let subscribe: Subscribe, connect: DevInt, disconnect: DevInt, isPaired: DevInt, validate: DevInt
        let startSession: DevInt, stopSession: DevInt, copy: Copy, copyID: CopyID, retain: DevVoid, release: DevVoid
    }
    private static let api: API? = {
        guard let h = dlopen("/System/Library/PrivateFrameworks/MobileDevice.framework/MobileDevice", RTLD_NOW) else { return nil }
        func f<T>(_ n: String, _ t: T.Type) -> T? { dlsym(h, n).map { unsafeBitCast($0, to: t) } }
        guard let s = f("AMDeviceNotificationSubscribeWithOptions", Subscribe.self), let c = f("AMDeviceConnect", DevInt.self),
              let d = f("AMDeviceDisconnect", DevInt.self), let p = f("AMDeviceIsPaired", DevInt.self), let v = f("AMDeviceValidatePairing", DevInt.self),
              let st = f("AMDeviceStartSession", DevInt.self), let sp = f("AMDeviceStopSession", DevInt.self), let cp = f("AMDeviceCopyValue", Copy.self),
              let id = f("AMDeviceCopyDeviceIdentifier", CopyID.self), let r = f("AMDeviceRetain", DevVoid.self), let rl = f("AMDeviceRelease", DevVoid.self)
        else { return nil }
        return API(subscribe: s, connect: c, disconnect: d, isPaired: p, validate: v, startSession: st, stopSession: sp, copy: cp, copyID: id, retain: r, release: rl)
    }()

    private var note: OpaquePointer?
    private var attached: [String: OpaquePointer] = [:]
    private let queue = DispatchQueue(label: "id.guardia.mobiledevice")
    private static weak var shared: MobileDevices?

    func start() {
        guard let api = MobileDevices.api, note == nil else { return }
        MobileDevices.shared = self
        let opts = ["NotificationOptionSearchForPairedNetworkDevices": true] as CFDictionary
        _ = api.subscribe({ info, _ in
            guard let info, let dev = info.load(as: OpaquePointer?.self) else { return }
            let msg = info.load(fromByteOffset: 8, as: UInt32.self)
            DispatchQueue.main.async { MobileDevices.shared?.event(dev, msg) }
        }, 0, 0, nil, &note, opts)
    }

    private func event(_ dev: OpaquePointer, _ msg: UInt32) {
        guard let api = MobileDevices.api, let id = api.copyID(dev)?.takeRetainedValue() as String? else { return }
        if msg == 1 {
            if attached[id] == nil { api.retain(dev); attached[id] = dev }
            read(id)
        } else if msg == 2, let d = attached.removeValue(forKey: id) {
            api.release(d)
        }
    }

    /// Read every attached device again (they report a new level now and then, not on change).
    func refresh() { for id in attached.keys { read(id) } }

    private func read(_ id: String) {
        guard let api = MobileDevices.api, let dev = attached[id] else { return }
        queue.async { [weak self] in
            guard api.connect(dev) == 0 else { return }
            defer { _ = api.disconnect(dev) }
            let name = api.copy(dev, nil, "DeviceName" as CFString)?.takeRetainedValue() as? String ?? "iPhone"
            let kind = api.copy(dev, nil, "DeviceClass" as CFString)?.takeRetainedValue() as? String ?? "iPhone"
            guard api.isPaired(dev) == 1, api.validate(dev) == 0, api.startSession(dev) == 0 else { return }
            let pct = (api.copy(dev, "com.apple.mobile.battery" as CFString, "BatteryCurrentCapacity" as CFString)?.takeRetainedValue() as? NSNumber)?.intValue
            let charging = (api.copy(dev, "com.apple.mobile.battery" as CFString, "BatteryIsCharging" as CFString)?.takeRetainedValue() as? NSNumber)?.boolValue ?? false
            _ = api.stopSession(dev)
            guard let pct else { return }
            DispatchQueue.main.async {
                guard let self else { return }
                let p = Phone(id: id, name: name, kind: kind, percent: pct, charging: charging, seen: Date())
                if let i = self.devices.firstIndex(where: { $0.id == id }) { self.devices[i] = p } else { self.devices.append(p) }
                // forget a device not heard from for six hours
                self.devices.removeAll { Date().timeIntervalSince($0.seen) > 6 * 3600 }
                self.onChange?()
            }
        }
    }
}
