import SwiftUI
import WebKit

struct TurnstileChallengeView: UIViewRepresentable {
    let captchaURL: URL
    let onToken: (String) -> Void
    let onFailure: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(captchaURL: captchaURL, onToken: onToken, onFailure: onFailure)
    }

    func makeUIView(context: Context) -> WKWebView {
        let contentController = WKUserContentController()
        contentController.add(context.coordinator, name: Coordinator.handlerName)

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController = contentController
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false

        let webView = WKWebView(frame: .zero, configuration: configuration)
        context.coordinator.attach(webView: webView, contentController: contentController)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = false
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.load(URLRequest(
            url: captchaURL,
            cachePolicy: .reloadIgnoringLocalCacheData,
            timeoutInterval: 20
        ))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        coordinator.detach()
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        static let handlerName = "baggerTurnstile"

        private let captchaURL: URL
        private let onToken: (String) -> Void
        private let onFailure: () -> Void
        private weak var webView: WKWebView?
        private weak var contentController: WKUserContentController?
        private var acceptedToken = false

        init(captchaURL: URL, onToken: @escaping (String) -> Void, onFailure: @escaping () -> Void) {
            self.captchaURL = captchaURL
            self.onToken = onToken
            self.onFailure = onFailure
        }

        func attach(webView: WKWebView, contentController: WKUserContentController) {
            self.webView = webView
            self.contentController = contentController
        }

        func detach() {
            contentController?.removeScriptMessageHandler(forName: Self.handlerName)
            contentController = nil
            webView = nil
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard !acceptedToken,
                  message.name == Self.handlerName,
                  let body = message.body as? [String: Any],
                  Set(body.keys) == ["token"],
                  let token = body["token"] as? String,
                  token.count >= 20,
                  token.count <= 4_096,
                  !token.contains(where: \Character.isWhitespace)
            else {
                return
            }
            acceptedToken = true
            contentController?.removeScriptMessageHandler(forName: Self.handlerName)
            webView?.stopLoading()
            onToken(token)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            if navigationAction.targetFrame?.isMainFrame != false {
                decisionHandler(isExactCaptchaURL(url) ? .allow : .cancel)
                return
            }

            let allowedSubframe = url.scheme == "about" ||
                (url.scheme == "https" && url.host == "challenges.cloudflare.com")
            decisionHandler(allowedSubframe ? .allow : .cancel)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationResponse: WKNavigationResponse,
            decisionHandler: @escaping @MainActor @Sendable (WKNavigationResponsePolicy) -> Void
        ) {
            guard let url = navigationResponse.response.url else {
                decisionHandler(.cancel)
                return
            }
            if navigationResponse.isForMainFrame {
                decisionHandler(isExactCaptchaURL(url) ? .allow : .cancel)
            } else {
                let allowed = url.scheme == "about" ||
                    (url.scheme == "https" && url.host == "challenges.cloudflare.com")
                decisionHandler(allowed ? .allow : .cancel)
            }
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            nil
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation?, withError error: Error) {
            failOnce()
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation?, withError error: Error) {
            failOnce()
        }

        private func isExactCaptchaURL(_ url: URL) -> Bool {
            url.scheme == "https" &&
                url.host == captchaURL.host &&
                url.path == captchaURL.path &&
                url.query == nil &&
                url.fragment == nil
        }

        private func failOnce() {
            guard !acceptedToken else { return }
            acceptedToken = true
            detach()
            onFailure()
        }
    }
}
