import AppKit

// Recent VS Code projects (the File › Open Recent list VS Code keeps in its storage.json),
// and opening one in VS Code or in a new Claude Code terminal.
enum Projects {
    struct Project { let name: String; let url: URL }

    private static let storage = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/Code/User/globalStorage/storage.json")
    private static var cache: (stamp: Date, list: [Project])?

    static func recent() -> [Project] {
        let stamp = (try? FileManager.default.attributesOfItem(atPath: storage.path)[.modificationDate] as? Date) ?? .distantPast
        if let c = cache, c.stamp == stamp { return c.list }
        var list: [Project] = []
        if let data = try? Data(contentsOf: storage),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let menus = (json["lastKnownMenubarData"] as? [String: Any])?["menus"] {
            var seen = Set<String>()
            walk(menus) { item in
                guard let id = item["id"] as? String, id == "openRecentFolder" || id == "openRecentWorkspace",
                      let uri = item["uri"] as? [String: Any], (uri["scheme"] as? String) == "file",
                      let path = uri["path"] as? String, !seen.contains(path),
                      FileManager.default.fileExists(atPath: path) else { return }
                seen.insert(path)
                let url = URL(fileURLWithPath: path)
                list.append(Project(name: url.deletingPathExtension().lastPathComponent, url: url))
            }
        }
        cache = (stamp, list)
        return list
    }

    private static func walk(_ node: Any, _ visit: ([String: Any]) -> Void) {
        if let d = node as? [String: Any] { visit(d); d.values.forEach { walk($0, visit) } }
        else if let a = node as? [Any] { a.forEach { walk($0, visit) } }
    }

    static func openInCode(_ p: Project) {
        let ws = NSWorkspace.shared
        guard let app = ws.urlForApplication(withBundleIdentifier: "com.microsoft.VSCode") else { ws.open(p.url); return }
        ws.open([p.url], withApplicationAt: app, configuration: NSWorkspace.OpenConfiguration())
    }

    // A new Ghostty window running `claude` in the folder. Ghostty 1.3 takes the folder and the
    // first input from AppleScript; when it isn't running yet, its first window is used instead
    // of opening a second one.
    static func claude(in dir: URL) {
        let path = dir.path.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
        let src = """
        set dir to "\(path)"
        set wasRunning to application "Ghostty" is running
        tell application "Ghostty"
            if wasRunning then
                set cfg to new surface configuration
                set initial working directory of cfg to dir
                set initial input of cfg to "claude" & linefeed
                new window with configuration cfg
            else
                activate
                repeat 40 times
                    if (count of windows) > 0 then exit repeat
                    delay 0.1
                end repeat
                set t to focused terminal of selected tab of front window
                input text ("cd " & quoted form of dir & " && clear && claude") to t
                send key "enter" to t
            end if
            activate
        end tell
        """
        AppleScript.run(src)
    }
}

// AppleScript off the main thread, one script at a time. Each app asks once for permission
// ("Kamar ingin mengontrol …").
enum AppleScript {
    private static let queue = DispatchQueue(label: "id.kamar.applescript", qos: .userInitiated)
    static func run(_ src: String, done: ((String?) -> Void)? = nil) {
        queue.async {
            var err: NSDictionary?
            let out = NSAppleScript(source: src)?.executeAndReturnError(&err).stringValue
            if let err { NSLog("[kamar] applescript: %@", err) }
            if let done { DispatchQueue.main.async { done(out) } }
        }
    }
}
