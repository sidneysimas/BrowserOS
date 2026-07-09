diff --git a/chrome/browser/browseros/onboarding/browseros_onboarding_prefs.h b/chrome/browser/browseros/onboarding/browseros_onboarding_prefs.h
new file mode 100644
index 0000000000000000000000000000000000000000..305109fa7ffe0451e6ab64e2b0fc83c5ee47c3d5
--- /dev/null
+++ b/chrome/browser/browseros/onboarding/browseros_onboarding_prefs.h
@@ -0,0 +1,28 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#ifndef CHROME_BROWSER_BROWSEROS_ONBOARDING_BROWSEROS_ONBOARDING_PREFS_H_
+#define CHROME_BROWSER_BROWSEROS_ONBOARDING_BROWSEROS_ONBOARDING_PREFS_H_
+
+class Profile;
+
+namespace browseros::onboarding {
+
+// Returns whether onboarding should interrupt startup for `profile`.
+bool ShouldShow(Profile* profile);
+
+// Marks the BrowserOS onboarding popup complete for `profile`.
+void MarkCompleted(Profile* profile);
+
+// Tells Chromium's built-in (DICE) first-run that first-run is already finished,
+// so `FirstRunService::ShouldOpenFirstRun()` stops re-intercepting the browser
+// launch after BrowserOS onboarding completes. Without this, completing
+// onboarding deadlocks: every attempt to open a browser window re-enters the
+// upstream first-run flow (which BrowserOS bypassed on entry) and no window is
+// ever shown. Call once when BrowserOS takes over first-run.
+void NeutralizeUpstreamFirstRun();
+
+}  // namespace browseros::onboarding
+
+#endif  // CHROME_BROWSER_BROWSEROS_ONBOARDING_BROWSEROS_ONBOARDING_PREFS_H_
