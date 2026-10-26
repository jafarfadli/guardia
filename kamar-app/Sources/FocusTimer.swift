import Foundation

// One countdown shown in the island: a focus block, a rest, or a timer typed into the search.
final class FocusTimer {
    enum Kind { case focus, rest, timer }
    private(set) var end: Date?
    private(set) var total: Double = 0
    private(set) var kind: Kind = .focus
    private(set) var label = ""
    var isRest: Bool { kind == .rest }
    var running: Bool { end != nil }
    var remaining: Double { end.map { $0.timeIntervalSinceNow } ?? 0 }
    /// What the island calls it: "fokus", "istirahat", or the timer's own label.
    var name: String {
        switch kind {
        case .focus: return "fokus"
        case .rest: return "istirahat"
        case .timer: return label.isEmpty ? "timer" : label
        }
    }
    var onChange: (() -> Void)?
    var onFinish: ((_ kind: Kind, _ name: String) -> Void)?
    private var t: Timer?

    func start(minutes: Int, rest: Bool) { start(seconds: Double(minutes) * 60, kind: rest ? .rest : .focus) }

    func start(seconds: Double, kind: Kind, label: String = "") {
        total = seconds
        self.kind = kind
        self.label = label
        end = Date().addingTimeInterval(total)
        t?.invalidate()
        t = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            guard let self else { return }
            if self.remaining <= 0 { self.finish() } else { self.onChange?() }
        }
        t?.tolerance = 0.1
        onChange?()
    }

    func stop() { end = nil; t?.invalidate(); onChange?() }

    private func finish() {
        let k = kind, n = name
        stop()
        onFinish?(k, n)
    }
}
