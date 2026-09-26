## Question
As of late September 2026, what share of real traffic can run an SPA that needs the **Navigation API + URLPattern with no History-API fallback**? Sub-questions: iOS/iPadOS on 26.2+ by point release, devices stuck on iOS 18, Firefox ESR status, and Chrome/Edge enterprise pinning. I also settled the factual conflicts between earlier notes where I could check them.

Everything below was re-checked on 2026-09-25/26. Raw data came from: caniuse-lite 1.0.30001812 (published 2026-09-24, usage from StatCounter), @mdn/browser-compat-data 8.1.3 (2026-09-24), StatCounter CSV exports, the TelemetryDeck CSV export, Apple's App Store page and Safari release-notes JSON, whattrainisitnow.com, and tsc 7.0.2 run locally.

---

## 1. Support floor (BCD 8.1.3, cross-checked with vendor notes)

| Feature | Chrome/Edge | Firefox | Safari / iOS |
|---|---|---|---|
| Navigation API (`navigation`, `navigate` event, `intercept`, `transition`) | 102 (May 2022) | 147 (2026-01-13) | 26.2 (2025-12-12) |
| `NavigationPrecommitController` (precommitHandler) | 141 | 147 | preview only, iOS **no** |
| URLPattern | 95 | 142 (2025-08-19) | 26.0 (2025-09-15) |
| Symbol.dispose / DisposableStack / `using` | 125 / 134 / 134 | 141 | **preview only**, iOS no (also not in Safari 27) |
| `Element.moveBefore` | 133 | 144 | **no** (not in Safari 27) |
| `ariaNotify` | 141 | 150 | 27 (2026-09-14) |

- Apple's Safari 26.2 release notes say: "Released December 12, 2025 … Safari 26.2 is available for iOS 26.2, iPadOS 26.2, visionOS 26.2, macOS 26.2, macOS Sequoia, and macOS Sonoma … Added support for the Navigation API."
- Safari 26.0 (2025-09-15) added URLPattern and shipped for macOS 26, Sequoia and Sonoma. Macs on Ventura or older top out below Safari 26, so they have neither API.
- Safari 27.0 fixes several Navigation API bugs that remain in the 26.2–26.6 line:
  - `NavigateEvent.canIntercept` should be false for a different port.
  - `navigationType` should be `"replace"` when navigating to the current URL.
  - Pages using the Navigation API could get offset hit-testing, which made elements unclickable.
  
  A router has to tolerate these on Safari 26.x.
- **Router implication:** do not depend on `precommitHandler`. Safari 26.x/27 does not have it.

## 2. iOS/iPadOS: share on 26.2 or later

All iOS browsers use WebKit (Chrome for iPhone is 5.7% of mobile traffic in StatCounter Aug 2026), so the iOS version is the gate for every browser on the device.

**Apple (App Store devices, June 7, 2026; bar-chart JSON on developer.apple.com/support/app-store):**
- iPhone, all devices: iOS 26 **79%**, iOS 18 **14%**, earlier **7%**.
- iPhone, devices from the last 4 years: 86 / 11 / 3.
- iPad, all devices: iPadOS 26 68%, iPadOS 18 17%, earlier 15%.
- iPad, last 4 years: 79 / 16 / 5.
- Apple gives no point-release breakdown.
- A year earlier iOS 18 was at 82% of all iPhones and 88% of recent ones (MacRumors, 9to5Mac). iOS 26 is running about 3 points behind.

**StatCounter (web traffic, iOS mobile, worldwide), share on iOS ≥ 26.2 (including 27):**

| Month 2026 | ≥26.2 | 26.0 / 26.1 | iOS 18.x | ≤17 |
|---|---|---|---|---|
| Feb | 56.6 | 4.9 | 26.9 | 11.5 |
| May | 66.5 | 2.5 | 19.5 | 11.5 |
| Jun | 67.8 | 2.1 | 18.0 | 12.0 |
| Aug | **74.4** | 1.6 | 16.0 | 7.9 |
| Sep (1–25) | **75.6** | 1.4 | 16.7 | 6.2 |

- The iOS 18 bucket has stopped shrinking. Most of it is "iOS 18.7" at about 10.3%, flat since April.
- iPad (StatCounter tablet), Aug/Sep: ≥26.2 about 63–64%, iOS 18 about 13.5%, ≤17 about 21%.
- US iOS mobile, Aug: ≥26.2 **82.2%**, iOS 18 13.1%, ≤17 3.8%. iOS is 28.7% of all US web traffic (19.1% worldwide).
- iOS 27 shipped 2026-09-14 and was about 3.2% of iOS mobile traffic in the first ~10 days (StatCounter Sep). Any Safari-27-only feature is effectively unavailable on iOS for months.

**Caveat on the UA freeze.** Safari 26 freezes the OS token in the UA ("CPU iPhone OS 18_6", later 18_7). Only the `Version/26.x` token shows the real version. StatCounter notes that "Apple's Safari anti-fingerprinting changes misreported iOS 26.2 as 18.7 and iOS 26.1 as 18.6. Patch applied on 19 Jan 2026."
- In-app WKWebView browsers usually have no `Version/` token. I infer, but did not verify, that some iOS 26 in-app traffic is still counted as "18.7".
- So treat StatCounter's ≥26.2 figure as a **lower bound**. In-app webviews on iOS 26.2+ run the same WebKit and have the Navigation API.

**TelemetryDeck (app SDK, about 750k users that week; skewed toward newer iOS because apps set deployment targets), week of 2026-08-31, computed from its CSV:**
- iOS 26: 86.6%, iOS 18: 7.9%, iOS 27 (beta): 3.3%, ≤17: 2.3%.
- 26.0 and 26.1 have dropped out of the top 10. So **≥26.2 including 27 ≈ 89.7%**.

**Best estimate for Sept 2026:** about **76% (web traffic, lower bound) to 90% (app telemetry)** of iOS traffic can run the Navigation API. Apple's device count implies at most about 79% in June plus drift. Roughly **1 in 5 to 1 in 8 iPhone visits** cannot.

## 3. Devices stuck on iOS 18 because iOS 26 dropped them

- iOS 26 dropped the A12 phones: **iPhone XS, XS Max and XR** (2018). Floor is iPhone 11 / SE 2.
- **iOS 27 (2026-09-14) dropped no iPhones**, so everything that runs 26 also runs 27.
- iPadOS 26 dropped the iPad 7th gen, which is stuck on iPadOS 18.
- iPadOS 27 dropped iPad 8, mini 5, Air 3, and iPad Pro 11" 1st gen / 12.9" 3rd gen. These stay on iPadOS 26.x, which already includes 26.2+, so they keep the Navigation API.
- Apple continues iOS 18 security builds for the A12 phones; iOS 18.7.10 shipped for XR/XS/XS Max in August 2026.
- Since 2026-04-01, iOS 18.7.7+ has also been offered to iOS-26-capable holdouts, after the DarkSword/Coruna exploits (TidBITS, Six Colors). That removes security pressure to upgrade and is consistent with the flat StatCounter iOS 18 share.
- **No public source counts XS/XR devices.** TelemetryDeck publishes only the top 10 models.
- **My own mixture-model estimate from Apple's numbers (not measured):**
  - Assumption: 55–70% of active iPhones are under 4 years old, and older iOS-26-capable phones hold out at a rate similar to newer ones (11–14%).
  - Result: A12 phones stuck on iOS 18 ≈ **2–3% of active iPhones**; voluntary iOS 18 holdouts ≈ **11–12%**; the "earlier" 7% is mostly hardware-capped at iOS 15/16 (iPhone 6s/7/8/X).
- So about **9–10% of active iPhones are hardware-capped below 26.2 and will never get the Navigation API**. That floor falls only as devices are retired. The other ~11% could upgrade but have not.

## 4. Firefox

- **Current ESR is 153** (153.0esr on 2026-07-21; 153.3 on 2026-09-15). Its release notes say it adds "the Navigation API, URLPattern, Trusted Types, Sanitizer API…" since 140. **So yes, current ESR ≥ 147.**
- **Previous ESR 140** lacks both the Navigation API (147) and URLPattern (142). Its last build is 140.17 on 2026-09-29. whattrainisitnow says "ESR 140 is EOL → Updates to ESR 153" on **2026-10-13**.
- **ESR 115** is extended "only on Windows 7-8.1 and macOS 10.12-10.14 up to March 2027". It lacks both APIs. It is 0.13–0.26% of global traffic (caniuse / StatCounter).
- Firefox moved to a **2-week release cadence from Firefox 155 (2026-09-01)**. Mozilla presented this at launch as an experiment; the SUMO post presents it as the new schedule. The next ESR number and date have not been announced.
- StatCounter/caniuse show about 43% of desktop Firefox traffic on versions below 147. Most of that is odd non-ESR versions (121: 0.84%, 120: 0.44%, 135: 0.27% of all traffic), probably automated or spoofed UAs (not verified). Real auto-updating Firefox is not the problem. After Oct 13 the only supported Firefox without these APIs will be legacy ESR 115.

## 5. Chrome/Edge enterprise pinning

- **There is no public number for how many fleets pin versions.** Treat any figure as unknown.
- Mechanisms, all from vendor docs:
  - `TargetVersionPrefix` pinning. Google: "should be done only temporarily, such as while testing… or they can fall behind on critical security updates".
  - Chrome **Extended Stable** keeps its 8-week cadence while Stable moves to 2 weeks from **Chrome 153 (2026-09-08)**.
  - Edge moves to 2 weeks from **Edge 152 (2026-08-27)**. Extended Stable takes every 4th release (156, 160, …) and stays 8-weekly.
  - **ChromeOS LTS** has a 6-month feature cadence. LTS 144 has been current since 2026-04-21, and LTS 150 is due 2026-10-06.
- Observed long tail:
  - Chrome < 102: 0.65% of global traffic (caniuse) or 1.34% (StatCounter, all platforms). Part of that is bot-like, such as Chrome 70.
  - Edge < 102: 0.01–0.02%.
  - Chrome 109, the last build on Win 7/8.1, is 0.55–1.13% and supports both APIs.
- **Conclusion:** pinning cannot plausibly hold a real fleet below Chrome 102 (a 4-year-old build). Chromium is not the blocker here. Pinning matters only for features under about 6 months old. Extended Stable lags up to about 8 weeks, and ChromeOS LTS about 6 months.

## 6. Global answer

Weighting BCD support by caniuse-lite usage (tracked browsers = 97.3% of traffic):
- Navigation API + URLPattern: **~92.8%**.
- Unsupported: ~7.1 points:
  - iOS Safari < 26.2: 3.45 (iOS 18 alone: 2.11)
  - Firefox < 147: 1.09
  - desktop Safari < 26.2: 0.87
  - Chrome < 102: 0.65
  - UC Browser: 0.64
  - IE: 0.24
  - QQ: 0.09

Caveats:
- caniuse counts all Chrome for Android as the latest version, which overstates coverage.
- StatCounter's iOS versions are biased low for 26.x, which understates it.
- In iOS-heavy markets (US, Japan, UK) the gap is larger: about 5% of all US traffic is iOS below 26.2.
- **So a fallback-free SPA today loses about 1 in 14 visits globally, and 1 in 5 to 1 in 8 iPhone visits.**
- If v1 ships around mid-2027, extrapolating the trend (the iOS 18 bucket is flat, ≤17 is shrinking) gives maybe ~80% of iOS web traffic on ≥26.2 and ~94–95% globally. The ~9–10% hardware-capped iPhone floor remains.

## 7. Conflicts between earlier notes, resolved where checkable

- **Symbol.dispose.** Confirmed absent from Safari:
  - BCD 8.1.3: Safari "preview", Safari iOS false.
  - Apple's Safari 27 release notes (2026-09-14) do not mention dispose, DisposableStack or moveBefore.
  - TC39 finished-proposals lists Explicit Resource Management as Stage 4 with expected publication **2027** (ES2027).
  - tsc 7.0.2 has no `es2026` lib. `lib:["es2025","dom"]` gives TS2550 on `Symbol.dispose`; `["es2025","dom","esnext.disposable"]` passes. That lib would also type `DisposableStack`, which then fails at runtime in Safari.
  - **Resolution:** v1's contract is a string-named `.dispose()`. No `[Symbol.dispose]` in types or runtime until Safari ships it stable.
- **Safari 27 date:** Apple's release notes say "Released September 14, 2026". The WebKit blog post is dated 2026-09-17. Use **2026-09-14**. Safari 27 is available for iOS/iPadOS/visionOS/macOS 27, macOS 26 and Sequoia, and adds `ariaNotify`.
- **ArrowJS 1.0:** npm shows 1.0.0 at 2026-03-20T16:55Z and 1.0.6 at 2026-04-01. The March date is correct.
- **Node:** nodejs/Release schedule.json gives v25 maintenance from 2026-04-01 and **end 2026-06-01**. So "EOL 2026-03-31" is slightly wrong, but v25 is EOL either way. v26 has been Current since 2026-05-05 with LTS on 2026-10-28. v24 enters maintenance 2026-10-20, with end of life 2028-04-30. Use a floor of `>=24.12 || >=26`.
- The design-choice conflicts (naming, stores, resource, reactive-prop rule, diagnostic codes, in-page tools), moduleResolution, overloads and decorators are outside this question and I did not re-test them.

IMPLICATIONS
- Do not ship v1 fallback-free. About 7% of global tracked traffic and 10–24% of iOS web traffic (StatCounter lower bound 75.6% on 26.2+ in Sept 2026; TelemetryDeck 89.7%) cannot run the Navigation API. Include a small History-API adapter inside the router, behind the same public API, selected by `'navigation' in window`: delegated same-origin <a> clicks, pushState/replaceState, popstate, and manual scroll/focus restore. Do not write a general Navigation API polyfill.
- Drop the URLPattern runtime dependency. Route syntax should be a URLPattern-compatible pathname subset (`/users/:id`, trailing `*`) matched by a roughly 20-line RegExp compiler, which works on every evergreen browser. URLPattern gives nothing an SPA router needs at pathname level. The syntax stays forward-compatible if the framework later switches to native URLPattern.
- Never depend on `precommitHandler` / NavigationPrecommitController: it is absent in Safari 26.x and 27 (BCD 8.1.3: Safari preview only, iOS false). Do route guards and data loading in the `intercept({handler})` / adapter path.
- Test and work around Safari 26.2–26.6 Navigation API bugs that were fixed only in Safari 27 (canIntercept across ports, navigationType 'replace' on a same-URL navigation, hit-test offsets). Include the Navigation-API path on Safari 26.x in the CI browser matrix.
- Minimum-browser table for v1: Chrome/Edge (current stable minus ~6 months; the Navigation API needs only 102), Firefox ESR 153 / 147+, Safari/iOS 26.2+ for the native navigation path, and 18.x (or whatever the rest of the baseline requires) through the History adapter. Say plainly that roughly 9–10% of active iPhones are hardware-capped at iOS 18 or older, based on Apple's June 2026 7% 'earlier' figure plus my 2–3% XS/XR estimate.
- Set a measurable removal trigger for the History adapter, e.g. iOS ≥26.2 above 95% of iOS traffic in StatCounter or equivalent, rather than a date. The StatCounter iOS 18 bucket has been flat at about 16–17% since July 2026, and since April 2026 Apple offers iOS 18.7.x security builds to holdouts, so this will not happen soon.
- Treat Safari 27-only features (ariaNotify, released 2026-09-14, about 3% of iOS traffic after 10 days) as progressive enhancement only: fall back to an aria-live region. Treat moveBefore (no Safari at all) the same way: fall back to insertBefore and accept the state loss.
- Resolve the dispose conflict: the public contract is a string-named `.dispose()` on roots, models and mount handles. No `[Symbol.dispose]` in v1 types or runtime, and no `esnext.disposable` in lib. Reasons: Safari lacks it even in 27, Explicit Resource Management is ES2027, tsc 7.0.2 with lib es2025 gives TS2550, and adding esnext.disposable would type DisposableStack/`using`, which fail at runtime in Safari. Keep a lint rule banning `using`.
- Enterprise Chromium pinning does not affect the Navigation API or URLPattern: Chrome under 102 is 0.65–1.34% of traffic and partly bots, Edge under 102 is about 0.02%, and Chrome 109 on Win7/8.1 supports both. Apply the 'minus ~6 months' rule only to newer features. Chromium Extended Stable is 8-weekly (Chrome 153 / Edge 152 moved Stable to 2 weeks), and ChromeOS LTS is about 6 months behind.
- Firefox: ESR 140, which lacks both the Navigation API and URLPattern, is EOL on 2026-10-13 and auto-migrates to ESR 153, which has both. The only supported Firefox without them afterwards is legacy ESR 115 (Win7–8.1, macOS 10.12–10.14, until March 2027, about 0.1–0.3% of traffic). The History adapter covers it at no extra cost.
- Correct the tooling floor: Node v25 reached end of life on 2026-06-01 per nodejs/Release schedule.json; v26 becomes LTS on 2026-10-28. The dev-server floor should be `>=24.12 || >=26`. Experiments run on 25.1.0 are on an EOL line that predates stable type stripping (25.2).

OPEN
- No public source counts iPhone XS/XS Max/XR devices still active. The 2–3% of active iPhones figure is my mixture-model inference from Apple's all-devices vs last-4-years numbers, not a measurement. A real figure would need a first-party analytics source with device models (e.g., the target app's own telemetry).
- How much of StatCounter's residual 'iOS 18.7' (~10.3% of iOS mobile traffic) is really iOS 26 WKWebView/in-app traffic with no `Version/` UA token? If most of it is, the web-traffic share on ≥26.2 is closer to the ~86–90% app-telemetry figure than to 75.6%.
- Is there any public data on enterprise Chrome/Edge pinning (share of managed fleets using TargetVersionPrefix, Extended Stable, or ChromeOS LTS)? I found none. The observable version tail is the only proxy.
- What are the next Firefox ESR's number and date under the 2-week cadence, and will Mozilla keep the 2-week experiment? Both affect how the spec pins a Firefox minimum.
- Where do the anomalous Firefox 120/121/135 UAs (~1.5% of global traffic in StatCounter) come from? If they are bots, the real Firefox gap is ESR 115 only.
- caniuse counts all Chrome for Android as the latest version. What share of Android traffic is on Chrome/WebView below 102 (Android 4.4/5/6 caps)? I did not verify this per Android version.
- At what threshold should the History adapter be removed (e.g., iOS ≥26.2 above 95% of iOS traffic), and who measures it: StatCounter or the adopting app's own analytics?

SOURCES
- Apple Developer: App Store iOS/iPadOS usage (June 7, 2026): https://developer.apple.com/support/app-store/
- MacRumors: Apple Reveals How Many iPhones Were Running iOS 26 Before WWDC (2026-06-09): https://www.macrumors.com/2026/06/09/ios-26-adoption-stats-wwdc/
- 9to5Mac: iOS 26 adoption grows, but still lags slightly behind iOS 18 (2026-06-10): https://9to5mac.com/2026/06/10/ios-26-adoption-grows-but-still-lags-slightly-behind-ios-18/
- StatCounter: iOS Version Market Share Mobile Worldwide (with UA-freeze patch note): https://gs.statcounter.com/ios-version-market-share/mobile/worldwide
- StatCounter CSV export endpoint (iOS version, Aug/Sep 2026; browser version; OS, US and worldwide): https://gs.statcounter.com/chart.php?device=Mobile&device_hidden=mobile&statType_hidden=ios_version&region_hidden=ww&granularity=monthly&statType=iOS%20Version&region=Worldwide&fromInt=202608&toInt=202608&fromMonthYear=2026-08&toMonthYear=2026-08&csv=1
- TelemetryDeck: iOS Minor Versions Market Share 2026: https://telemetrydeck.com/survey/apple/iOS/minorSystemVersions/
- TelemetryDeck: iOS Major Versions Market Share 2026: https://telemetrydeck.com/survey/apple/iOS/majorSystemVersions/
- TelemetryDeck: iPhone Models Market Share 2026: https://telemetrydeck.com/survey/apple/iPhone/models/
- Lapcat Software: iOS 26 adoption measured only third-party browsers (UA freeze): https://lapcatsoftware.com/articles/2026/1/3.html
- UAParser.js: How to Detect iOS >= 26: https://docs.uaparser.dev/guides/how-to-detect-ios-26-using-javascript.html
- mozilla-mobile/firefox-ios #29263: iOS 26 will freeze OS UA bit at 18_7: https://github.com/mozilla-mobile/firefox-ios/issues/29263
- 51Degrees: Apple freezes user-agent strings in iOS 26/Safari 26: https://51degrees.com/blog/apple-ios26-safari26-user-agent-string-device-detection
- Wikipedia: iOS 27 (released 2026-09-14, no devices dropped): https://en.wikipedia.org/wiki/IOS_27
- MacRumors: iPadOS 27 Drops Support for a Wave of iPads: https://www.macrumors.com/2026/06/08/ipados-27-drops-support-for-a-wave-of-ipads/
- TidBITS: Apple Offers iOS 18.7.7 Security Update as Alternative to iOS 26.4: https://tidbits.com/2026/04/01/apple-offers-ios-18-7-7-security-update-as-alternative-to-ios-26-4-upgrade/
- whattrainisitnow: Firefox ESR schedule (ESR 140 EOL 2026-10-13; ESR 115 to March 2027): https://whattrainisitnow.com/release/?version=esr
- whattrainisitnow: Firefox release calendar (2-week cadence from 155): https://whattrainisitnow.com/calendar/
- Mozilla Support Blog: Firefox new release cadence and what to expect: https://blog.mozilla.org/sumo/2026/08/19/firefox-new-release-cadence-and-what-to-expect/
- Firefox 153.0esr release notes: https://www.firefox.com/en-US/firefox/153.0esr/releasenotes/
- Chrome for Developers: Chrome's two-week release cycle: https://developer.chrome.com/blog/chrome-two-week-release
- Microsoft Edge Blog: new Edge release cycle (2026-06-11): https://blogs.windows.com/msedgedev/2026/06/11/faster-updates-enterprise-friendly-schedule-the-new-microsoft-edge-release-cycle/
- Chrome Enterprise Help: Manage Chrome updates (Windows) / TargetVersionPrefix: https://support.google.com/chrome/a/answer/6350036?hl=en
- Chrome Enterprise Help: ChromeOS LTS release notes: https://support.google.com/chrome/a/answer/12239814?hl=en
- WebKit: WebKit Features for Safari 26.2 (Navigation API): https://webkit.org/blog/17640/webkit-features-for-safari-26-2/
- WebKit: WebKit Features for Safari 27.0: https://webkit.org/blog/18325/webkit-features-for-safari-27-0/
- Apple: Safari 26.2 Release Notes: https://developer.apple.com/documentation/safari-release-notes/safari-26_2-release-notes
- Apple: Safari 27 Release Notes: https://developer.apple.com/documentation/safari-release-notes/safari-27-release-notes
- Eclectic Light: macOS Golden Gate and Tahoe 26.7 / Sequoia 15.8 (Sonoma unsupported): https://eclecticlight.co/2026/09/14/apple-has-released-macos-golden-gate-and-security-updates-to-tahoe-26-7-sequoia-15-8/
- mdn/browser-compat-data #30532: ariaNotify support data: https://github.com/mdn/browser-compat-data/issues/30532
- OIDAISDES: How good is browser support for the ARIA Notify API? (2026-06-03): https://oidaisdes.org/blog/aria-notify-browser-support/
- TC39 finished proposals (Explicit Resource Management, expected publication 2027): https://github.com/tc39/proposals/blob/main/finished-proposals.md
- tc39/proposal-explicit-resource-management (README still says Stage 3): https://github.com/tc39/proposal-explicit-resource-management
- nodejs/Release schedule.json: https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
- npm registry: caniuse-lite 1.0.30001812: https://registry.npmjs.org/caniuse-lite
- npm registry: @mdn/browser-compat-data 8.1.3: https://registry.npmjs.org/@mdn/browser-compat-data
- npm registry: @arrow-js/core (1.0.0 published 2026-03-20): https://registry.npmjs.org/@arrow-js/core