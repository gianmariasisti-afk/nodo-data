import UIKit
import Capacitor
import AuthenticationServices
import CryptoKit
import UserNotifications

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = NodoBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// The Capacitor web view, plus nodo's own native plugins.
class NodoBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NodoAppleSignInPlugin())
        bridge?.registerPluginInstance(NodoPushPlugin())
    }
}

/// Sign in with Apple for nodo. The web layer (app/native/native.js) passes a random nonce;
/// Apple receives its SHA-256, and Supabase checks the raw nonce against the identity token.
@objc(NodoAppleSignInPlugin)
public class NodoAppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "NodoAppleSignInPlugin"
    public let jsName = "NodoAppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?

    @objc func authorize(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce"), !nonce.isEmpty else {
            call.reject("A nonce is required")
            return
        }
        pendingCall = call
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()

        DispatchQueue.main.async {
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let token = String(data: tokenData, encoding: .utf8) else {
            call.reject("Apple did not return an identity token")
            return
        }
        call.resolve([
            "identityToken": token,
            "authorizationCode": credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) } ?? "",
            "user": credential.user,
            "email": credential.email ?? "",
            "givenName": credential.fullName?.givenName ?? "",
            "familyName": credential.fullName?.familyName ?? ""
        ])
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            call.reject("Sign in with Apple was cancelled", "CANCELED")
        } else {
            call.reject(error.localizedDescription, "FAILED")
        }
    }
}

/// Push notifications for nodo (16 Nov 2026). The web layer (app/native/native.js) asks for permission only after
/// nodo's own sheet, then registers the phone with Apple and stores the token in Supabase (register_push_device).
/// Taps are passed to the web layer as a "tap" event, kept until a listener takes it (the app may be starting).
@objc(NodoPushPlugin)
public class NodoPushPlugin: CAPPlugin, CAPBridgedPlugin, NotificationHandlerProtocol {
    public let identifier = "NodoPushPlugin"
    public let jsName = "NodoPush"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    private var tokenCalls: [CAPPluginCall] = []

    /// Debug builds run from Xcode talk to Apple's sandbox; TestFlight and App Store builds to production.
    private var apnsEnv: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    override public func load() {
        bridge?.notificationRouter.pushNotificationHandler = self
        NotificationCenter.default.addObserver(self, selector: #selector(didRegister(_:)), name: .capacitorDidRegisterForRemoteNotifications, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(didFail(_:)), name: .capacitorDidFailToRegisterForRemoteNotifications, object: nil)
    }

    private static func label(_ s: UNAuthorizationStatus) -> String {
        switch s {
        case .notDetermined: return "prompt"
        case .denied: return "denied"
        default: return "granted"
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            call.resolve(["status": NodoPushPlugin.label(settings.authorizationStatus)])
        }
    }

    /// Shows the iOS prompt (only the first time; afterwards iOS answers with the stored choice).
    @objc func request(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                call.resolve(["status": NodoPushPlugin.label(settings.authorizationStatus)])
            }
        }
    }

    /// Asks Apple for this phone's token. Resolves with { token, env }.
    @objc func register(_ call: CAPPluginCall) {
        call.keepAlive = true
        tokenCalls.append(call)
        DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            var s = UIApplication.openSettingsURLString
            if #available(iOS 16.0, *) { s = UIApplication.openNotificationSettingsURLString }
            if let url = URL(string: s) { UIApplication.shared.open(url) }
            call.resolve()
        }
    }

    @objc private func didRegister(_ note: Notification) {
        guard let data = note.object as? Data else { return }
        let token = data.map { String(format: "%02x", $0) }.joined()
        let calls = tokenCalls; tokenCalls = []
        for c in calls { c.resolve(["token": token, "env": apnsEnv]); bridge?.releaseCall(c) }
    }

    @objc private func didFail(_ note: Notification) {
        let message = (note.object as? Error)?.localizedDescription ?? "Registration failed"
        let calls = tokenCalls; tokenCalls = []
        for c in calls { c.reject(message); bridge?.releaseCall(c) }
    }

    /// While nodo is open, nothing pops up: Today already shows the changes. The admin test is the exception,
    /// so it can be seen without leaving the app.
    public func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        let nodo = notification.request.content.userInfo["nodo"] as? [String: Any]
        if (nodo?["kind"] as? String) == "test" { return [.banner, .list, .sound] }
        return []
    }

    public func didReceive(response: UNNotificationResponse) {
        let info = response.notification.request.content.userInfo
        let nodo = info["nodo"] as? [String: Any] ?? [:]
        notifyListeners("tap", data: JSTypes.coerceDictionaryToJSObject(nodo) ?? [:], retainUntilConsumed: true)
    }
}
