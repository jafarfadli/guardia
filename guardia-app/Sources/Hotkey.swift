import Carbon.HIToolbox

// A global keyboard shortcut that needs no permission (no Accessibility, no Input Monitoring):
// a Carbon hot key is delivered to the app that registered it, whatever app is in front, a
// full-screen one included. Guardia uses ⌃Space to open the island's search.
final class Hotkey {
    private var ref: EventHotKeyRef?
    private static var actions: [UInt32: () -> Void] = [:]
    private static var installed = false

    init(keyCode: Int, modifiers: Int, id: UInt32, action: @escaping () -> Void) {
        Hotkey.install()
        Hotkey.actions[id] = action
        let hid = EventHotKeyID(signature: OSType(0x4752_4449), id: id) // "GRDI"
        RegisterEventHotKey(UInt32(keyCode), UInt32(modifiers), hid, GetApplicationEventTarget(), 0, &ref)
    }

    deinit { if let ref { UnregisterEventHotKey(ref) } }

    /// False when another app already holds the combination.
    var registered: Bool { ref != nil }

    private static func install() {
        guard !installed else { return }
        installed = true
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, event, _ in
            var hid = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil,
                              MemoryLayout<EventHotKeyID>.size, nil, &hid)
            let id = hid.id
            DispatchQueue.main.async { Hotkey.actions[id]?() }
            return noErr
        }, 1, &spec, nil, nil)
    }
}
