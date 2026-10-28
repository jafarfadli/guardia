import AppKit
import Darwin

// What the room shows besides the time: the notes on the chalkboard, the GitHub card on the
// cork board, Claude's sessions on the monitor, the battery dials, the toy traffic light and the
// weather in the window. Each source reports here; whatever changed goes to the wallpaper page
// (window.guardia.setWidgets) a moment later, together, and the whole set again after a reload.
final class Widgets {
    weak var wallpaper: WallpaperController?
    private(set) var state: [String: Any] = [:]
    private var sent: [String: Data] = [:]
    private var pending: [String: Any] = [:]
    private var flushWork: DispatchWorkItem?

    func set(_ key: String, _ value: Any?) {
        let v = value ?? NSNull()
        let data = (try? JSONSerialization.data(withJSONObject: [key: v])) ?? Data()
        guard sent[key] != data else { return }
        sent[key] = data
        state[key] = v
        pending[key] = v
        flushWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.flush() }
        flushWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: work)
    }

    private func flush() {
        guard !pending.isEmpty else { return }
        wallpaper?.setWidgets(pending)
        pending.removeAll()
    }

    /// For `guardia://status`.
    var debugState: [String: Any] {
        var d: [String: Any] = [:]
        for (k, v) in state {
            switch k {
            case "notes": d[k] = ((v as? String) ?? "").split(separator: "\n").count
            case "github": d[k] = (v as? [String: Any])?["total"] ?? "none"
            case "photos": d[k] = ((v as? [Any]) ?? []).filter { $0 is String }.count
            default: d[k] = v
            }
        }
        return d
    }
}

// ------------------------------------------------------------------ Claude Code sessions
// Claude Code keeps a record per running session in ~/.claude/sessions/<pid>.json: its name, a
// status ("busy" while it works) and, while Remote Control is on, a bridgeSessionId. This is
// Claude Code's own bookkeeping, not a promised format: when a field is missing the session is
// simply left out. The room's monitor lists the Remote Control sessions; the cats watch them
// all, and hear when one that worked a while hands the turn back.
final class ClaudeSessions {
    struct Session: Equatable { let name: String; let running: Bool }
    struct Record: Equatable { let pid: Int32; let name: String; let busy: Bool; let remote: Bool }
    var onChange: (([Session]) -> Void)?
    /// Whether any session works now; and a name when one stops after working half a minute or more.
    var onWork: ((_ busy: Bool, _ done: String?) -> Void)?
    private var timer: Timer?
    private var last: [Session]?
    private var busySince: [Int32: Date] = [:]
    private var wasBusy = false
    private let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".claude/sessions")

    func start() {
        scan()
        timer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in self?.scan() }
        timer?.tolerance = 0.5
    }

    private func scan() {
        let dir = self.dir
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let records = ClaudeSessions.read(dir)
            DispatchQueue.main.async {
                guard let self else { return }
                let list = records.filter(\.remote).map { Session(name: $0.name, running: $0.busy) }
                if list != self.last { self.last = list; self.onChange?(list) }
                self.follow(records)
            }
        }
    }

    private func follow(_ records: [Record]) {
        var done: String?
        for r in records {
            if r.busy { if busySince[r.pid] == nil { busySince[r.pid] = Date() } }
            else if let since = busySince.removeValue(forKey: r.pid), Date().timeIntervalSince(since) >= 30 { done = r.name }
        }
        // a session that quit while busy is just gone
        let alive = Set(records.map(\.pid))
        busySince = busySince.filter { alive.contains($0.key) }
        let busy = !busySince.isEmpty
        if busy != wasBusy || done != nil { wasBusy = busy; onWork?(busy, done) }
    }

    static func read(_ dir: URL) -> [Record] {
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        var out: [Record] = []
        for f in files where f.pathExtension == "json" {
            guard let d = try? Data(contentsOf: f), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
                  let pid = (j["pid"] as? NSNumber)?.int32Value, alive(pid) else { continue }
            let cwd = (j["cwd"] as? String).map { URL(fileURLWithPath: $0).lastPathComponent } ?? "claude"
            let name = (j["name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? cwd
            let remote = !((j["bridgeSessionId"] as? String) ?? "").isEmpty
            out.append(Record(pid: pid, name: name, busy: (j["status"] as? String) == "busy", remote: remote))
        }
        return out.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }

    private static func alive(_ pid: Int32) -> Bool { kill(pid, 0) == 0 || errno == EPERM }
}

// ------------------------------------------------------------------ GitHub
// The last thirteen weeks of the contribution calendar of the account `gh` is logged in to, with
// GitHub's own levels (0 none … 4 most), as the green squares on github.com. Private repositories
// count only when "Include private contributions on my profile" is on in GitHub's settings.
final class GitHubStreak {
    var onChange: (([String: Any]?) -> Void)?
    private var timer: Timer?
    static let gh = ["/opt/homebrew/bin/gh", "/usr/local/bin/gh"].first { FileManager.default.isExecutableFile(atPath: $0) }

    func start() {
        fetch()
        timer = Timer.scheduledTimer(withTimeInterval: 30 * 60, repeats: true) { [weak self] _ in self?.fetch() }
        NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 20) { self?.fetch() }
        }
    }

    func fetch() {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let card = GitHubStreak.load()
            DispatchQueue.main.async { if card != nil || GitHubStreak.gh == nil { self?.onChange?(card) } }
        }
    }

    private static let query = "query{viewer{contributionsCollection{contributionCalendar{weeks{firstDay contributionDays{contributionCount contributionLevel}}}}}}"
    private static let levels = ["NONE": 0, "FIRST_QUARTILE": 1, "SECOND_QUARTILE": 2, "THIRD_QUARTILE": 3, "FOURTH_QUARTILE": 4]

    static func load() -> [String: Any]? {
        guard let gh else { return nil }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: gh)
        p.arguments = ["api", "graphql", "-f", "query=\(query)"]
        let out = Pipe()
        p.standardOutput = out
        p.standardError = FileHandle.nullDevice
        guard (try? p.run()) != nil else { return nil }
        let data = out.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        guard p.terminationStatus == 0,
              let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let weeks = ((((j["data"] as? [String: Any])?["viewer"] as? [String: Any])?["contributionsCollection"] as? [String: Any])?["contributionCalendar"] as? [String: Any])?["weeks"] as? [[String: Any]]
        else { return nil }
        var total = 0
        // weeks run Sunday to Saturday; the current one stops at today: the rest are -1
        let recent: [[String: Any]] = weeks.suffix(13).map { w in
            let days = (w["contributionDays"] as? [[String: Any]]) ?? []
            total += days.reduce(0) { $0 + (($1["contributionCount"] as? Int) ?? 0) }
            let lv = days.map { levels[($0["contributionLevel"] as? String) ?? ""] ?? 0 }
            return ["start": (w["firstDay"] as? String) ?? "", "days": lv + Array(repeating: -1, count: max(0, 7 - lv.count))]
        }
        return ["weeks": recent, "total": total]
    }
}

// ------------------------------------------------------------------ how hard the Mac works
// Green, amber or red for the toy traffic light: the processor over the last half minute, the
// memory pressure macOS reports, and how hot it runs. A new colour must hold for ten seconds.
final class SystemLoad {
    var onChange: ((String) -> Void)?
    private var timer: Timer?
    private var prev: host_cpu_load_info?
    private var busy: Double = 0
    private var level = ""
    private var candidate = ""
    private var held = 0
    private(set) var debug: [String: Any] = [:]

    func start() {
        sample()
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.sample() }
        timer?.tolerance = 1
    }

    private func sample() {
        if let now = SystemLoad.cpuTicks() {
            if let p = prev {
                let d = { (a: UInt32, b: UInt32) in Double(a &- b) }
                let user = d(now.cpu_ticks.0, p.cpu_ticks.0), sys = d(now.cpu_ticks.1, p.cpu_ticks.1)
                let idle = d(now.cpu_ticks.2, p.cpu_ticks.2), nice = d(now.cpu_ticks.3, p.cpu_ticks.3)
                let total = user + sys + idle + nice
                if total > 0 { busy = busy * 0.8 + (user + sys + nice) / total * 0.2 }
            }
            prev = now
        }
        var pressure: Int32 = 1
        var size = MemoryLayout<Int32>.size
        sysctlbyname("kern.memorystatus_vm_pressure_level", &pressure, &size, nil, 0)
        let thermal = ProcessInfo.processInfo.thermalState
        let next: String
        if busy > 0.85 || pressure >= 4 || thermal == .serious || thermal == .critical { next = "red" }
        else if busy > 0.6 || pressure == 2 || thermal == .fair { next = "amber" }
        else { next = "green" }
        debug = ["cpu": Int(busy * 100), "memory": pressure, "thermal": thermal.rawValue]
        if next == level { candidate = ""; return }
        if next != candidate { candidate = next; held = 0 }
        held += 1
        if level.isEmpty || held >= 2 { level = next; candidate = ""; onChange?(next) }
    }

    private static func cpuTicks() -> host_cpu_load_info? {
        var info = host_cpu_load_info()
        var count = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info>.size / MemoryLayout<integer_t>.size)
        let r = withUnsafeMutablePointer(to: &info) { ptr in
            ptr.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, $0, &count) }
        }
        return r == KERN_SUCCESS ? info : nil
    }
}
