import Foundation

// A plain focus/rest timer shown in the island.
final class FocusTimer {
    private(set) var end: Date?
    private(set) var total: Double = 0
    private(set) var isRest = false
    var running: Bool { end != nil }
    var remaining: Double { end.map { $0.timeIntervalSinceNow } ?? 0 }
    var onChange: (() -> Void)?
    var onFinish: ((_ wasRest: Bool) -> Void)?
    private var t: Timer?

    func start(minutes: Int, rest: Bool) {
        total = Double(minutes) * 60
        isRest = rest
        end = Date().addingTimeInterval(total)
        t?.invalidate()
        t = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            guard let self else { return }
            if self.remaining <= 0 { self.finish() } else { self.onChange?() }
        }
        onChange?()
    }

    func stop() { end = nil; t?.invalidate(); onChange?() }

    private func finish() {
        let rest = isRest
        stop()
        onFinish?(rest)
    }
}
