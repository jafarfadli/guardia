import AppKit

// Alarms at a clock time ("alarm 7.30 bangun"), kept across restarts. They ring through the
// island. A Mac that is asleep can't be woken by an app, so an alarm that came due while it
// slept rings on wake if it is less than ten minutes late, and is reported as missed otherwise.
final class Alarms {
    struct Alarm: Codable, Equatable { let id: UUID; let date: Date; let label: String }
    private(set) var list: [Alarm] = []
    var onChange: (() -> Void)?
    var onRing: ((Alarm) -> Void)?
    var onMissed: ((Alarm) -> Void)?
    private var timer: Timer?
    private let key = "alarms"

    init() {
        if let d = UserDefaults.standard.data(forKey: key), let l = try? JSONDecoder().decode([Alarm].self, from: d) { list = l }
        NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in self?.due() }
    }

    func start() { due() }

    @discardableResult
    func add(hour: Int, minute: Int, label: String) -> Alarm {
        let a = Alarm(id: UUID(), date: Alarms.next(hour: hour, minute: minute), label: label)
        list.append(a)
        list.sort { $0.date < $1.date }
        save()
        return a
    }

    func remove(_ id: UUID) { list.removeAll { $0.id == id }; save() }

    func snooze(_ a: Alarm, minutes: Int = 5) {
        list.append(Alarm(id: UUID(), date: Date().addingTimeInterval(Double(minutes) * 60), label: a.label))
        list.sort { $0.date < $1.date }
        save()
    }

    private func save() {
        UserDefaults.standard.set(try? JSONEncoder().encode(list), forKey: key)
        schedule()
        onChange?()
    }

    private func schedule() {
        timer?.invalidate()
        guard let first = list.first else { return }
        let t = Timer(fire: max(first.date, Date().addingTimeInterval(0.2)), interval: 0, repeats: false) { [weak self] _ in self?.due() }
        t.tolerance = 0.5
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private func due() {
        let now = Date()
        let ready = list.filter { $0.date <= now.addingTimeInterval(0.5) }
        guard !ready.isEmpty else { schedule(); return }
        list.removeAll { ready.contains($0) }
        save()
        for a in ready {
            if now.timeIntervalSince(a.date) < 600 { onRing?(a) } else { onMissed?(a) }
        }
    }

    // ------------------------------------------------------------------ formatting
    static func next(hour: Int, minute: Int) -> Date {
        let cal = Calendar.current
        var d = cal.date(bySettingHour: hour, minute: minute, second: 0, of: Date()) ?? Date()
        if d <= Date().addingTimeInterval(5) { d = cal.date(byAdding: .day, value: 1, to: d) ?? d }
        return d
    }

    static func clock(_ d: Date) -> String {
        let c = Calendar.current.dateComponents([.hour, .minute], from: d)
        return String(format: "%02d.%02d", c.hour ?? 0, c.minute ?? 0)
    }

    static func day(_ d: Date) -> String { Calendar.current.isDateInToday(d) ? "hari ini" : "besok" }

    static func when(hour: Int, minute: Int) -> String {
        let d = next(hour: hour, minute: minute)
        let mins = Int(d.timeIntervalSinceNow / 60)
        let rel = mins >= 60 ? "\(mins / 60) jam \(mins % 60) menit lagi" : "\(max(1, mins)) menit lagi"
        return "\(day(d)) · \(rel)"
    }
}

// The bell: a soft system sound every couple of seconds, for a minute at most.
final class Ringer {
    private var t: Timer?
    private var count = 0
    func start() {
        stop()
        count = 0
        NSSound(named: "Glass")?.play()
        t = Timer.scheduledTimer(withTimeInterval: 2.2, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.count += 1
            if self.count > 27 { self.stop(); return }
            NSSound(named: "Glass")?.play()
        }
    }
    func stop() { t?.invalidate(); t = nil }
}
