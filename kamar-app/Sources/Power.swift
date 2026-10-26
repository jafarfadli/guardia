import Foundation
import IOKit.ps

// Battery state, pushed on change (plugging in, unplugging, getting low).
final class Power {
    struct State: Equatable { var percent: Int; var charging: Bool; var onAC: Bool }
    private(set) var state = State(percent: 100, charging: false, onAC: true)
    var onChange: ((State, State) -> Void)?
    private var source: CFRunLoopSource?

    func start() {
        state = Power.read()
        let ctx = Unmanaged.passUnretained(self).toOpaque()
        source = IOPSNotificationCreateRunLoopSource({ ctx in
            guard let ctx else { return }
            let me = Unmanaged<Power>.fromOpaque(ctx).takeUnretainedValue()
            let new = Power.read()
            if new != me.state { let old = me.state; me.state = new; me.onChange?(old, new) }
        }, ctx)?.takeRetainedValue()
        if let source { CFRunLoopAddSource(CFRunLoopGetMain(), source, .defaultMode) }
    }

    static func read() -> State {
        guard let info = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
              let list = IOPSCopyPowerSourcesList(info)?.takeRetainedValue() as? [CFTypeRef] else { return State(percent: 100, charging: false, onAC: true) }
        for ps in list {
            guard let d = IOPSGetPowerSourceDescription(info, ps)?.takeUnretainedValue() as? [String: Any] else { continue }
            let cap = d[kIOPSCurrentCapacityKey] as? Int ?? 100
            let max = d[kIOPSMaxCapacityKey] as? Int ?? 100
            let charging = d[kIOPSIsChargingKey] as? Bool ?? false
            let ac = (d[kIOPSPowerSourceStateKey] as? String) == kIOPSACPowerValue
            return State(percent: Int((Double(cap) / Double(Swift.max(1, max))) * 100), charging: charging, onAC: ac)
        }
        return State(percent: 100, charging: false, onAC: true)
    }
}
