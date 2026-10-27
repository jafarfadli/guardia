import CoreLocation
import Foundation

// The weather in the window, and where the sun stands: the Mac's own location (asked for once
// through Location Services), or Jakarta when it may not be used. Only a rounded position, about
// ten kilometres across, goes to Open-Meteo (a free weather service that needs no account).
final class Weather: NSObject, CLLocationManagerDelegate {
    var onWeather: (([String: Any]) -> Void)?
    var onLocation: ((Double, Double) -> Void)?
    private let manager = CLLocationManager()
    private(set) var location: (lat: Double, lon: Double) = (-6.2, 106.82) // design/tokens.json "location"
    private var timer: Timer?
    private(set) var debug: [String: Any] = ["source": "jakarta"]

    func start() {
        // the last place first, so the sun is right before Location Services answers
        if let saved = UserDefaults.standard.array(forKey: "location") as? [Double], saved.count == 2 {
            location = (saved[0], saved[1])
            debug["source"] = "saved"
        }
        onLocation?(location.lat, location.lon)
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
        if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() } else { locate() }
        fetch()
        timer = Timer.scheduledTimer(withTimeInterval: 20 * 60, repeats: true) { [weak self] _ in self?.locate(); self?.fetch() }
        timer?.tolerance = 60
    }

    private var allowed: Bool { manager.authorizationStatus == .authorizedAlways } // macOS grants "always" for when-in-use
    private func locate() { if allowed { manager.requestLocation() } }

    func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        debug["permission"] = m.authorizationStatus.rawValue
        locate()
    }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let c = locs.last?.coordinate else { return }
        let moved = abs(c.latitude - location.lat) > 0.05 || abs(c.longitude - location.lon) > 0.05
        location = (c.latitude, c.longitude)
        debug["source"] = "mac"
        UserDefaults.standard.set([c.latitude, c.longitude], forKey: "location")
        onLocation?(c.latitude, c.longitude)
        if moved { fetch() }
    }

    func locationManager(_ m: CLLocationManager, didFailWithError error: Error) { debug["error"] = (error as NSError).code }

    private func fetch() {
        let lat = (location.lat * 10).rounded() / 10, lon = (location.lon * 10).rounded() / 10
        guard let url = URL(string: "https://api.open-meteo.com/v1/forecast?latitude=\(lat)&longitude=\(lon)&current=weather_code,precipitation,is_day,temperature_2m") else { return }
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let data, let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let cur = j["current"] as? [String: Any], let code = (cur["weather_code"] as? NSNumber)?.intValue else { return }
            let rain = (cur["precipitation"] as? NSNumber)?.doubleValue ?? 0
            let (kind, amount) = Weather.kind(code: code, rain: rain)
            var w: [String: Any] = ["kind": kind, "amount": amount, "code": code]
            if let t = (cur["temperature_2m"] as? NSNumber)?.doubleValue { w["temp"] = Int(t.rounded()) }
            DispatchQueue.main.async { self?.debug["code"] = code; self?.onWeather?(w) }
        }.resume()
    }

    /// WMO weather codes → what the window shows, and how hard it rains (0…1).
    static func kind(code: Int, rain: Double) -> (String, Double) {
        let wet = min(1, 0.35 + rain / 6)
        switch code {
        case 0, 1: return ("clear", 0)
        case 2: return ("partly", 0)
        case 3: return ("cloudy", 0)
        case 45, 48: return ("fog", 0)
        case 51...57: return ("rain", min(wet, 0.4))
        case 61...67, 80...82: return ("rain", wet)
        case 95...99: return ("storm", max(wet, 0.8))
        default: return ("cloudy", 0) // snow and the rest: a grey day
        }
    }
}
